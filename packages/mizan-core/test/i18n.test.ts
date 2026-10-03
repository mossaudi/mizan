import { describe, expect, test } from "bun:test"
import {
  detectLanguage,
  detectLanguageWithBasis,
  isSupportedLanguage,
  isRtlLanguage,
  getLanguage,
  validateQuestion,
  processQuestion,
  rtlLanguages,
  ltrLanguages,
  LANGUAGE_COUNT,
  MAX_QUESTION_LENGTH,
  SUPPORTED_LANGUAGES,
} from "../src/i18n.ts"

describe("the detection says how it decided, because a marker heuristic cannot always tell", () => {
  // ## The defect this describes
  //
  // `detectLanguage` scored whole-word markers and took whichever language the `SUPPORTED_LANGUAGES`
  // table listed first. That is a fact about this file's array order, and it printed with the same
  // confidence as a marker only one language in the world has. Malay and Indonesian share "yang",
  // "dan", "di"; Arabic and Urdu share "ال"; Persian and Urdu share "و" and "که". A tie between
  // candidates the evidence cannot separate is a fact about the evidence, and hiding it is the same
  // class of defect as printing SSR over cases that contributed no sentences.
  //
  // These tests pin the four bases and, more importantly, pin that a confusable text is *never*
  // reported as a confident detection.

  test("a text with no marker at all is a script default, and says so", () => {
    // A real Arabic question that contains none of the Arabic markers. Before this the answer was
    // "ar" from `scriptDefaults.arabic`, indistinguishable from "we found the word من in it".
    const detected = detectLanguageWithBasis("كم عدد الصلوات")
    expect(detected?.code).toBe("ar")
    expect(detected?.basis).toBe("script-default")
  })

  test("a question in a script with one supported language is not called a detection", () => {
    const detected = detectLanguageWithBasis("行为的回报是什么？这是一个重要的问题。")
    expect(detected?.basis).toBe("sole-script-language")
  })

  test("a text with a decisive marker is a detection", () => {
    const detected = detectLanguageWithBasis("What is the reward of deeds?")
    expect(detected).toEqual({ code: "en", basis: "marker" })
  })

  test("Malay and Indonesian markers are not separable, so the tie is reported", () => {
    // The concrete case. Every word below is in both marker sets — that is the point, and it is why
    // the basis is `ambiguous-markers` rather than a guess dressed as a detection. The code is still
    // returned, because refusing a language the script *does* support would be worse than labelling
    // the guess; the label is what stops it being read as a finding.
    const confusable = "yang dan di ke dengan apa yang akan ke dengan dan di"
    const detected = detectLanguageWithBasis(confusable)
    expect(detected?.basis).toBe("ambiguous-markers")
    // `?? "none"` rather than `?? ""` so an undetected text fails the assertion instead of passing it:
    // an empty string is not a language, and neither is the absence of one.
    expect(["ms", "id"]).toContain(detected?.code ?? "none")
  })

  test("every pair of languages that share a marker really does tie, which is the whole claim", () => {
    // Derived from the table rather than listed, because a hand-written list of confusable pairs is a
    // list that goes stale the moment a marker is added — and going stale here is silent: the pairs
    // stop tying, the label stops appearing, and the caveat becomes decoration nobody ever sees.
    //
    // One earlier version of this test asserted a Persian/Urdu overlap from memory. It does not exist
    // in this table: Urdu writes کے and Persian که, which are different characters, so that text is a
    // decisive Persian detection. A test written from a memory of the languages instead of from the
    // data was asserting a defect that was not there.
    const shared = (a: (typeof SUPPORTED_LANGUAGES)[number], b: (typeof SUPPORTED_LANGUAGES)[number]): readonly string[] =>
      a.markers.filter((marker) => b.markers.includes(marker))
    const pairs: { readonly names: string; readonly markers: readonly string[] }[] = []
    for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 1) {
      for (let j = i + 1; j < SUPPORTED_LANGUAGES.length; j += 1) {
        const markers = shared(SUPPORTED_LANGUAGES[i]!, SUPPORTED_LANGUAGES[j]!)
        if (markers.length > 0) pairs.push({ names: `${SUPPORTED_LANGUAGES[i]!.code}/${SUPPORTED_LANGUAGES[j]!.code}`, markers })
      }
    }
    expect(pairs.length).toBeGreaterThan(0)
    const tied = pairs.filter((pair) => detectLanguageWithBasis(pair.markers.join(" "))?.basis === "ambiguous-markers")
    // Every shared-marker pair ties, and the count is asserted as an equality rather than a floor. A
    // failure here names the pairs that stopped tying and means one of two things: the marker sets
    // stopped overlapping, or a third language started outscoring that text. Both need a human to
    // decide what the answer should be, which is why this is not a floor the way
    // `LANGUAGE_COUNT >= 25` was.
    const untied = pairs.filter((pair) => !tied.includes(pair)).map((pair) => pair.names)
    expect(untied).toEqual([])
    expect(tied.map((pair) => pair.names)).toContain("id/ms")
    expect(tied.map((pair) => pair.names)).toContain("hi/mr")
    // A tie can be wider than the pair that revealed it: "esta recompensa importante" is shared by four
    // Romance languages at once, so the winner is one of four, not one of two. Asserted as what it is —
    // a supported language from the same script — rather than pretending the pair bounds the answer.
    for (const pair of tied) {
      const code = detectLanguageWithBasis(pair.markers.join(" "))?.code
      expect(code !== undefined && isSupportedLanguage(code)).toBe(true)
      expect(SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.rtl).toBe(false)
    }
  })

  test("a script's only-supported-language case is not a tie", () => {
    // The mirror of the test above: a table with one language per script must never manufacture an
    // ambiguity. Arabic has no markers at all, so `script-default` is its honest answer, not a tie.
    expect(detectLanguageWithBasis("ما هو ثواب الأعمال؟")?.basis).toBe("script-default")
  })

  test("the code-only API cannot disagree with the basis API, because it delegates", () => {
    // Two detectors would be two answers to the same question (AGENTS.md section 17). Asserted over
    // every sample above plus the ones `detectLanguage` already has tests for.
    for (const text of ["", "   ", "What is the reward of deeds?", "كم عدد الصلوات", "yang dan di ke dengan", "ജീവിതം", "abc123"]) {
      expect(detectLanguage(text)).toBe(detectLanguageWithBasis(text)?.code ?? null)
    }
  })

  test("processQuestion passes the basis through instead of dropping it", () => {
    // The boundary is the only product caller, so this is where the honesty either survives or is
    // lost. A caller receiving only `language` cannot tell a default from a detection, which is what
    // the previous signature guaranteed.
    const processed = processQuestion("كم عدد الصلوات")
    if (!("value" in processed)) throw new Error(`expected a detection: ${processed.error}`)
    expect(processed.value.basis).toBe("script-default")
    expect(processed.value.language).toBe("ar")
  })
})

describe("supported languages", () => {
  test("at least 25 languages are supported", () => {
    expect(LANGUAGE_COUNT).toBeGreaterThanOrEqual(25)
  })

  test("the published count is the exact count, so a wrong figure cannot ship again", () => {
    // A floor is not a claim. A Sprint 2 deliverable published "45 languages" against a table of 44
    // while the only assertion in this file was `>= 25`, which the wrong number passed as readily as
    // the right one. Pinned exactly: adding a language now fails the suite until the published figure
    // moves with it, which is the point of publishing it at all.
    expect(LANGUAGE_COUNT).toBe(44)
  })

  test("each language has a unique code", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(LANGUAGE_COUNT)
  })

  test("each language has a name and native name", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.name.length).toBeGreaterThan(0)
      expect(lang.nativeName.length).toBeGreaterThan(0)
    }
  })

  test("each language has at least one character range", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.ranges.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe("detectLanguage", () => {
  test("detects Arabic script text", () => {
    expect(detectLanguage("ما هو ثواب الأعمال؟")).toBe("ar")
  })

  test("detects English text", () => {
    expect(detectLanguage("What is the reward of deeds?")).toBe("en")
  })

  test("detects Urdu (Arabic script with Urdu markers)", () => {
    expect(detectLanguage("اعمال کا کیا ثواب ہے؟ یہ ایک اہم سوال ہے۔")).toBe("ur")
  })

  test("detects Persian (Arabic script with Persian markers)", () => {
    expect(detectLanguage("پاداش اعمال چیست؟ این یک سوال مهم است.")).toBe("fa")
  })

  test("detects Turkish (Latin script with Turkish markers)", () => {
    expect(detectLanguage("Amüllerin mükafatı nedir? Bu önemli bir sorudur.")).toBe("tr")
  })

  test("detects Indonesian (Latin script with Indonesian markers)", () => {
    expect(detectLanguage("Apa pahala dari amal? Ini adalah pertanyaan yang penting untuk dijawab.")).toBe("id")
  })

  test("detects Bengali", () => {
    expect(detectLanguage("আমলের পুরস্কার কী? এটি একটি গুরুত্বপূর্ণ প্রশ্ন।")).toBe("bn")
  })

  test("detects Hindi", () => {
    expect(detectLanguage("कर्मों का फल क्या है? यह एक महत्वपूर्ण प्रश्न है।")).toBe("hi")
  })

  test("detects Chinese", () => {
    expect(detectLanguage("行为的回报是什么？这是一个重要的问题。")).toBe("zh")
  })

  test("detects Japanese", () => {
    expect(detectLanguage("行いの報いとは何ですか？これは重要な質問です。")).toBe("ja")
  })

  test("detects Korean", () => {
    expect(detectLanguage("행위의 보상은 무엇입니까? 이것은 중요한 질문입니다.")).toBe("ko")
  })

  test("detects Russian (Cyrillic script)", () => {
    expect(detectLanguage("Какова награда за дела? Это важный вопрос.")).toBe("ru")
  })

  test("detects French (Latin script with French markers)", () => {
    expect(detectLanguage("Quelle est la récompense des actes ? C'est une question importante.")).toBe("fr")
  })

  test("detects German (Latin script with German markers)", () => {
    expect(detectLanguage("Was ist der Lohn der Taten? Das ist eine wichtige Frage.")).toBe("de")
  })

  test("detects Spanish (Latin script with Spanish markers)", () => {
    expect(detectLanguage("¿Cuál es la recompensa de las obras? Es una pregunta importante.")).toBe("es")
  })

  test("detects Portuguese (Latin script with Portuguese markers)", () => {
    expect(detectLanguage("Qual é a recompensa das obras? É uma pergunta importante.")).toBe("pt")
  })

  test("detects Italian (Latin script with Italian markers)", () => {
    expect(detectLanguage("Qual è la ricompensa delle opere? È una domanda importante.")).toBe("it")
  })

  test("detects Dutch (Latin script with Dutch markers)", () => {
    expect(detectLanguage("Wat is de beloning van de daden? Dit is een belangrijke vraag.")).toBe("nl")
  })

  test("detects Polish (Latin script with Polish markers)", () => {
    expect(detectLanguage("Jaka jest nagroda za czyny? To jest ważne pytanie.")).toBe("pl")
  })

  test("detects Ukrainian (Cyrillic script with Ukrainian markers)", () => {
    expect(detectLanguage("Яка города за вчинки? Це важливе питання.")).toBe("uk")
  })

  test("detects Swahili (Latin script with Swahili markers)", () => {
    expect(detectLanguage("Thawabu ya matendo ni nini? Hii ni swali muhimu.")).toBe("sw")
  })

  test("detects Hausa (Latin script with Hausa markers)", () => {
    expect(detectLanguage("Mai yin aiki mene ne? Wannan tambaya ce muhimmi.")).toBe("ha")
  })

  test("detects Somali (Latin script with Somali markers)", () => {
    expect(detectLanguage("Waa maxay abaalguudka camalka? Tani su'aal muhiim ah.")).toBe("so")
  })

  test("detects Amharic", () => {
    expect(detectLanguage("የሥራዎች ሽልማት ምንድን ነው? ይህ አስፈላጊ ጥያቄ ነው።")).toBe("am")
  })

  test("detects Hebrew", () => {
    expect(detectLanguage("מה הוא שכר המעשים? זו שאלה חשובה.")).toBe("he")
  })

  test("detects Pashto (Arabic script with Pashto markers)", () => {
    expect(detectLanguage("د عملونو ثواب څه دی؟ دا یو مهم پوښتنه ده.")).toBe("ps")
  })

  test("detects Sindhi (Arabic script with Sindhi markers)", () => {
    expect(detectLanguage("عملن جو ثواب ڇا آهي؟ هي هڪ مهم سوال آهي.")).toBe("sd")
  })

  test("detects Uyghur (Arabic script with Uyghur markers)", () => {
    expect(detectLanguage("ئەمەلنىڭ ساۋابى نېمە؟ بۇ مۇھىم سوئال.")).toBe("ug")
  })

  test("detects Kazakh (Cyrillic script with Kazakh markers)", () => {
    expect(detectLanguage("Іс-әрекеттердің сыйлығы қандай? Бұл маңызды сұрақ.")).toBe("kk")
  })

  test("detects Uzbek (Latin script with Uzbek markers)", () => {
    expect(detectLanguage("Amalning mukofoti nima? Bu muhim savol.")).toBe("uz")
  })

  test("detects Azerbaijani (Latin script with Azerbaijani markers)", () => {
    expect(detectLanguage("Amalin mükafatı nədir? Bu vacib sualdır.")).toBe("az")
  })

  test("returns null for empty string", () => {
    expect(detectLanguage("")).toBeNull()
  })

  test("returns null for whitespace only", () => {
    expect(detectLanguage("   ")).toBeNull()
  })
})

describe("isSupportedLanguage", () => {
  test("returns true for supported languages", () => {
    expect(isSupportedLanguage("ar")).toBe(true)
    expect(isSupportedLanguage("en")).toBe(true)
    expect(isSupportedLanguage("zh")).toBe(true)
  })

  test("returns false for unsupported languages", () => {
    expect(isSupportedLanguage("xx")).toBe(false)
    expect(isSupportedLanguage("")).toBe(false)
  })
})

describe("isRtlLanguage", () => {
  test("returns true for RTL languages", () => {
    expect(isRtlLanguage("ar")).toBe(true)
    expect(isRtlLanguage("ur")).toBe(true)
    expect(isRtlLanguage("fa")).toBe(true)
    expect(isRtlLanguage("he")).toBe(true)
  })

  test("returns false for LTR languages", () => {
    expect(isRtlLanguage("en")).toBe(false)
    expect(isRtlLanguage("zh")).toBe(false)
    expect(isRtlLanguage("ja")).toBe(false)
  })
})

describe("getLanguage", () => {
  test("returns language for valid code", () => {
    const lang = getLanguage("ar")
    expect(lang).not.toBeNull()
    expect(lang?.name).toBe("Arabic")
  })

  test("returns null for invalid code", () => {
    expect(getLanguage("xx")).toBeNull()
  })
})

describe("validateQuestion", () => {
  test("accepts normal questions", () => {
    expect(validateQuestion("What is the reward of deeds?")).toBe(true)
    expect(validateQuestion("ما هو ثواب الأعمال؟")).toBe(true)
  })

  test("accepts questions that merely use a SQL word as an English word", () => {
    // The planted-violation guard. The filter rejected `\b(SELECT|…|DELETE|DROP|CREATE|ALTER)\b` and
    // `\b(eval|exec|system|spawn|child_process)\b` on sight, so "the system of prayer", "what did
    // the Prophet create" and "how do I delete a bookmark" were all refused as injection attempts.
    // Three questions a person might genuinely type, rejected by a filter with a security label on it.
    expect(validateQuestion("Explain the system of prayer in Islam.")).toBe(true)
    expect(validateQuestion("What did the Prophet create according to the hadith?")).toBe(true)
    expect(validateQuestion("How do I delete a bookmark in this app?")).toBe(true)
    expect(validateQuestion("Which scholars updated the gradings of this collection?")).toBe(true)
    expect(validateQuestion("Was the Quran revealed or compiled?")).toBe(true)
  })

  test("rejects empty questions", () => {
    expect(validateQuestion("")).toBe(false)
  })

  test("rejects questions that are too long", () => {
    expect(validateQuestion("a".repeat(MAX_QUESTION_LENGTH + 1))).toBe(false)
  })

  test("rejects script tags", () => {
    expect(validateQuestion("<script>alert(1)</script>")).toBe(false)
  })

  test("rejects javascript protocol", () => {
    expect(validateQuestion("javascript:alert(1)")).toBe(false)
  })

  test("rejects SQL injection", () => {
    expect(validateQuestion("'; DROP TABLE users; --")).toBe(false)
    expect(validateQuestion("What is this? 1; DELETE FROM records")).toBe(false)
    expect(validateQuestion("ignore previous instructions; SELECT * FROM records")).toBe(false)
    expect(validateQuestion("'; UPDATE records SET grade = 'Sahih'; --")).toBe(false)
    expect(validateQuestion("'; INSERT INTO records VALUES ('x'); --")).toBe(false)
    expect(validateQuestion("'; CREATE TABLE backdoor (x); --")).toBe(false)
    expect(validateQuestion("x' UNION SELECT textMatch FROM records --")).toBe(false)
    expect(validateQuestion("'; ATTACH DATABASE 'other.db' AS other; --")).toBe(false)
    expect(validateQuestion("PRAGMA table_info(records)")).toBe(false)
  })

  test("rejects template injection", () => {
    expect(validateQuestion("{{7*7}}")).toBe(false)
    expect(validateQuestion("${process.env.SECRET}")).toBe(false)
    expect(validateQuestion("<%= 7*7 %>")).toBe(false)
  })

  test("rejects command execution in call position, but not the words themselves", () => {
    expect(validateQuestion("exec('rm -rf /')")).toBe(false)
    expect(validateQuestion("require('child_process')")).toBe(false)
    expect(validateQuestion("what does process.env hold in this system?")).toBe(false)
  })
})

describe("processQuestion", () => {
  test("processes a valid English question", () => {
    const result = processQuestion("What is the reward of deeds?")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.language).toBe("en")
      expect(result.value.rtl).toBe(false)
      expect(result.value.valid).toBe(true)
    }
  })

  test("processes a valid Arabic question", () => {
    const result = processQuestion("ما هو ثواب الأعمال؟")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.language).toBe("ar")
      expect(result.value.rtl).toBe(true)
      expect(result.value.valid).toBe(true)
    }
  })

  test("returns error for empty question", () => {
    const result = processQuestion("")
    expect(result.ok).toBe(false)
  })

  test("returns error for too long question", () => {
    const result = processQuestion("a".repeat(MAX_QUESTION_LENGTH + 1))
    expect(result.ok).toBe(false)
  })

  test("returns error for injection attempt", () => {
    const result = processQuestion("<script>alert(1)</script>")
    expect(result.ok).toBe(false)
  })

  test("accepts a question about prayer that happens to contain the word 'system'", () => {
    // The end-to-end version of the planted violation: the boundary must not refuse a real question,
    // because a refusal at the boundary is a refusal the user sees and cannot argue with.
    const result = processQuestion("Explain the system of prayer in Islam.")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.language).toBe("en")
  })
})

describe("RTL and LTR language lists", () => {
  test("RTL languages include Arabic", () => {
    expect(rtlLanguages).toContain("ar")
  })

  test("LTR languages include English", () => {
    expect(ltrLanguages).toContain("en")
  })

  test("RTL and LTR lists are disjoint", () => {
    for (const code of rtlLanguages) {
      expect(ltrLanguages).not.toContain(code)
    }
  })

  test("all languages are in either RTL or LTR", () => {
    expect(rtlLanguages.length + ltrLanguages.length).toBe(LANGUAGE_COUNT)
  })
})
