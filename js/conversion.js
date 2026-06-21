/**
 * =============================================================================
 *  KrutiDev ↔ Unicode Devanagari — Bidirectional Font Converter
 *  File  : conversion.js
 * =============================================================================
 *
 *  Exposes two public conversion routines:
 *
 *    convert_to_unicode()       — KrutiDev / Shusha legacy encoding → Unicode
 *    Convert_to_Krutidev_010()  — Unicode Devanagari → KrutiDev 010
 *
 *  Both routines process input in ≤ 6,000-character chunks to keep the browser
 *  UI responsive on large documents. Chunk boundaries are always aligned to the
 *  nearest whitespace so words are never split mid-conversion.
 *
 *  Positional glyphs that require special handling (cannot be resolved by
 *  simple 1-to-1 table lookup):
 *    "f"        → ि   (iMatra — must move one slot to the RIGHT of its consonant)
 *    "Z"        → र्  (reph   — must move BEFORE its host consonant cluster)
 *    ±, Æ, Ç, É, Ê   (composite legacy glyphs expanded before substitution)
 * =============================================================================
 */

// ── Global Timer State ────────────────────────────────────────────────────────
var myTimer; // Holds the setTimeout ID so it can be cancelled by showLoad()

// ─────────────────────────────────────────────────────────────────────────────
//  Loading Overlay Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hides both loading divs and arms a 100 ms one-shot timer.
 *
 * The short delay gives the browser exactly one render cycle to update
 * the DOM before the heavy string-replacement loop monopolises the thread.
 */
function setTimer() {
    document.getElementById("loadDiv1").style.display = "none";
    document.getElementById("loadDiv2").style.display = "none";
    myTimer = setTimeout(showLoad, 100); // Pass function reference, not a string (modern best practice)
}

/**
 * Dismisses the loading overlay and cancels any pending timer.
 * Invoked automatically when the timer fires after conversion completes.
 */
function showLoad() {
    document.getElementById("loadDiv1").style.display = "none";
    document.getElementById("loadDiv2").style.display = "none";
    clearTimeout(myTimer);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pre-processing — Input Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises typographic (curly) apostrophes in the legacy input field,
 * then hands control to the main conversion pipeline.
 *
 * Curly apostrophe ( ' ) must be converted to straight ( ' ) because every
 * KrutiDev glyph table is keyed on the straight variant exclusively.
 */
function corrections() {
    var el = document.getElementById("legacy_text"); // Explicitly scoped — avoids implicit global
    var txt = el.value;
    el.value = "";                      // Visually clear the field during processing
    txt = txt.replace(/'/g, "'");   // Curly → straight apostrophe normalisation
    el.value = txt;
    convert_to_unicode();               // Hand off to the main conversion engine
}

// ─────────────────────────────────────────────────────────────────────────────
//  KrutiDev / Shusha → Unicode Devanagari
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts KrutiDev / Shusha legacy-encoded Devanagari text to Unicode.
 *
 * Processing order applied to every chunk:
 *  Pass 1  — Exhaustive 1-to-1 symbol substitution (array_one → array_two).
 *  Pass 2a — Expand composite glyph ±  (reph + anusvāra).
 *  Pass 2b — Expand composite glyph Æ  (reph + iMatra prefix).
 *  Pass 2c — Reposition iMatra "f"  →  ि  (one slot to the right).
 *  Pass 2d — Expand composite glyphs Ç / É  (iMatra + anusvāra).
 *  Pass 2e — Expand composite glyph Ê  (long-ī mātrā + reph marker).
 *  Pass 2f — Fix spurious "ि्" sequences that arise from pass 2c.
 *  Pass 2g — Reposition reph "Z"  →  र्  (before the host cluster).
 */
function convert_to_unicode() {
    setTimer();

    /* ── Lookup Tables ────────────────────────────────────────────────────────
     *
     * array_one  : legacy KrutiDev / Shusha glyphs  (source)
     * array_two  : corresponding Unicode code-points (target)
     *
     * ⚠  ORDERING IS CRITICAL — entries are longest-match-first.
     *    Never reorder without verifying no shorter entry is a prefix of a
     *    longer one, as the substitution loop is not greedy.
     *
     * ──────────────────────────────────────────────────────────────────────── */
    var array_one = new Array( //"kZsa", 
        // "(",")", 
        "ñ", "Q+Z", "sas", "aa", ")Z", "ZZ", "'", "'", "\u201c", "\u201d",
        "å", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹",
        "¶+", "d+", "[+k", "[+", "x+", "T+", "t+", "M+", "<+", "Q+", ";+", "j+", "u+",
        "Ùk", "Ù", "ä", "–", "—", "é", "™", "=kk", "f=k",
        "à", "á", "â", "ã", "ºz", "º", "í", "{k", "{", "=", "«",
        "Nî", "Vî", "Bî", "Mî", "<î", "|", "K", "}",
        "J", "Vª", "Mª", "<ªª", "Nª", "Ø", "Ý", "nzZ", "æ", "ç", "Á", "xz", "#", ":",
        "v‚", "vks", "vkS", "vk", "v", "b±", "Ã", "bZ", "b", "m", "Å", ",s", ",", "_",
        "ô", "d", "Dk", "D", "£", "[k", "[", "x", "Xk", "X", "Ä", "?k", "?", "³",
        "p", "Pk", "P", "N", "t", "Tk", "T", ">", "÷", "¥",
        "ê", "ë", "V", "B", "ì", "ï", "M+", "<+", "M", "<", ".k", ".",
        "r", "Rk", "R", "Fk", "F", ")", "n", "/k", "èk", "/", "Ë", "è", "u", "Uk", "U",
        "i", "Ik", "I", "Q", "¶", "c", "Ck", "C", "Hk", "H", "e", "Ek", "E",
        ";", "¸", "j", "y", "Yk", "Y", "G", "o", "Ok", "O",
        "'k", "'", "\"k", "\"", "l", "Lk", "L", "g",
        "È", "z",
        "Ì", "Í", "Î", "Ï", "Ñ", "Ò", "Ó", "Ô", "Ö", "Ø", "Ù", "Ük", "Ü",
        "‚", "¨", "ks", "©", "kS", "k", "h", "q", "w", "`", "s", "¢", "S",
        "a", "¡", "%", "W", "•", "·", "∙", "·", "~j", "~", "\\", "+", " ः",
        "^", "*", "Þ", "ß", "(", "¼", "½", "¿", "À", "¾", "A", "-", "&", "&", "Œ", "]", "~ ", "@",
        "ाे", "ाॅ", "ंै", "े्र", "अौ", "अो", "आॅ");

    var array_two = new Array( //"ksaZ",
        //"¼","½", 
        "॰", "QZ+", "sa", "a", "र्द्ध", "Z", "\"", "\"", "'", "'",
        "०", "१", "२", "३", "४", "५", "६", "७", "८", "९",
        "फ़्", "क़", "ख़", "ख़्", "ग़", "ज़्", "ज़", "ड़", "ढ़", "फ़", "य़", "ऱ", "ऩ", // one-byte nukta varNas
        "त्त", "त्त्", "क्त", "दृ", "कृ", "न्न", "न्न्", "=k", "f=",
        "ह्न", "ह्य", "हृ", "ह्म", "ह्र", "ह्", "द्द", "क्ष", "क्ष्", "त्र", "त्र्",
        "छ्य", "ट्य", "ठ्य", "ड्य", "ढ्य", "द्य", "ज्ञ", "द्व",
        "श्र", "ट्र", "ड्र", "ढ्र", "छ्र", "क्र", "फ्र", "र्द्र", "द्र", "प्र", "प्र", "ग्र", "रु", "रू",
        "ऑ", "ओ", "औ", "आ", "अ", "ईं", "ई", "ई", "इ", "उ", "ऊ", "ऐ", "ए", "ऋ",
        "क्क", "क", "क", "क्", "ख", "ख", "ख्", "ग", "ग", "ग्", "घ", "घ", "घ्", "ङ",
        "च", "च", "च्", "छ", "ज", "ज", "ज्", "झ", "झ्", "ञ",
        "ट्ट", "ट्ठ", "ट", "ठ", "ड्ड", "ड्ढ", "ड़", "ढ़", "ड", "ढ", "ण", "ण्",
        "त", "त", "त्", "थ", "थ्", "द्ध", "द", "ध", "ध", "ध्", "ध्", "ध्", "न", "न", "न्",
        "प", "प", "प्", "फ", "फ्", "ब", "ब", "ब्", "भ", "भ्", "म", "म", "म्",
        "य", "य्", "र", "ल", "ल", "ल्", "ळ", "व", "व", "व्",
        "श", "श्", "ष", "ष्", "स", "स", "स्", "ह",
        "ीं", "्र",
        "द्द", "ट्ट", "ट्ठ", "ड्ड", "कृ", "भ", "्य", "ड्ढ", "झ्", "क्र", "त्त्", "श", "श्",
        "ॉ", "ो", "ो", "ौ", "ौ", "ा", "ी", "ु", "ू", "ृ", "े", "े", "ै",
        "ं", "ँ", "ः", "ॅ", "ऽ", "ऽ", "ऽ", "ऽ", "्र", "्", "?", "़", ":",
        "'", "'", "\u201c", "\u201d", ";", "(", ")", "{", "}", "=", "।", ".", "-", "µ", "॰", ",", "् ", "/",
        "ो", "ॉ", "ैं", "्रे", "औ", "ओ", "ऑ");

    // Spelling-mistake corrections handled above in array_one (see: "sas","aa","ZZ","=kk","f=k").
    // The following two characters require context-sensitive positional logic (handled in Pass 2):
    //   "Z"  →  "र्" (reph)
    //   "f"  →  "ि"  (iMatra)

    /* ── Chunk-Based Processing ───────────────────────────────────────────────
     *
     * Long texts are split at word boundaries (spaces) into segments of at
     * most max_text_size characters.  This prevents the browser from freezing
     * on large documents by never blocking the main thread for too long.
     *
     * Variables:
     *   sthiti1     — start offset of the current chunk
     *   sthiti2     — end offset of the current chunk
     *   chale_chalo — loop flag: 1 = more chunks remain, 0 = final chunk done
     *
     * ──────────────────────────────────────────────────────────────────────── */
    var array_one_length = array_one.length;
    var modified_substring = document.getElementById("legacy_text").value;
    var text_size = document.getElementById("legacy_text").value.length;
    var processed_text = ''; // Accumulates fully converted output across all chunks
    var sthiti1 = 0;
    var sthiti2 = 0;
    var chale_chalo = 1;
    var max_text_size = 6000;

    while (chale_chalo == 1) {
        sthiti1 = sthiti2;

        if (sthiti2 < (text_size - max_text_size)) {
            sthiti2 += max_text_size;
            // Walk back to the nearest space so we never split a word across chunks
            while (document.getElementById("legacy_text").value.charAt(sthiti2) != ' ') {
                sthiti2--;
            }
        } else {
            // Final chunk — consume everything that remains
            sthiti2 = text_size;
            chale_chalo = 0;
        }

        var modified_substring = document.getElementById("legacy_text").value.substring(sthiti1, sthiti2);
        Replace_Symbols();
        processed_text += modified_substring;
        document.getElementById("unicode_text").value = processed_text;
    }

    // ── Inner Conversion Worker ───────────────────────────────────────────────
    /**
     * Replace_Symbols()
     *
     * Operates directly on the outer closure variable `modified_substring`.
     * Runs all six transformation passes in sequence on the current chunk.
     * Must be declared inside convert_to_unicode() so it shares the same
     * array_one / array_two scope without receiving them as parameters.
     */
    function Replace_Symbols() {

        // Guard: nothing to do for a blank chunk
        if (modified_substring != "") {

            // ── Pass 1: Direct 1-to-1 symbol substitution ────────────────────
            // Each array_one[i] is replaced exhaustively with array_two[i].
            // The inner while-loop repeats until indexOf returns -1, handling
            // edge cases where a replacement string itself contains a source glyph.
            for (var input_symbol_idx = 0; input_symbol_idx < array_one_length; input_symbol_idx++) {
                var idx = 0;
                while (idx != -1) {
                    modified_substring = modified_substring.replace(array_one[input_symbol_idx], array_two[input_symbol_idx]);
                    idx = modified_substring.indexOf(array_one[input_symbol_idx]);
                } // end while
            } // end for

            // ── Pass 2a: Glyph ±  →  reph marker + anusvāra ─────────────────
            // Seen in words like "कर्कंधु", "पूर्णांक".
            modified_substring = modified_substring.replace(/±/g, "Zं");

            // ── Pass 2b: Glyph Æ  →  reph prefix before iMatra ──────────────
            // Seen in words like "धार्मिक". Expands to "र्f" so that the
            // reph and iMatra can each be repositioned in their own passes below.
            modified_substring = modified_substring.replace(/Æ/g, "र्f");

            // ── Pass 2c: iMatra "f"  →  ि  (reposition one slot rightward) ──
            // In KrutiDev, the iMatra glyph "f" is encoded BEFORE the consonant
            // it belongs to.  Unicode requires ि AFTER the consonant.
            var position_of_i = modified_substring.indexOf("f");
            while (position_of_i != -1) {
                var character_next_to_i = modified_substring.charAt(position_of_i + 1);
                var character_to_be_replaced = "f" + character_next_to_i;
                modified_substring = modified_substring.replace(character_to_be_replaced, character_next_to_i + "ि");
                position_of_i = modified_substring.search(/f/, position_of_i + 1);
            } // end while

            // ── Pass 2d: Glyphs Ç / É  →  iMatra + anusvāra ("fa") ──────────
            // Ç appears in words like "किंकर"; É in words like "शर्मिंदा".
            modified_substring = modified_substring.replace(/Ç/g, "fa");
            modified_substring = modified_substring.replace(/É/g, "र्fa");

            var position_of_i = modified_substring.indexOf("fa");
            while (position_of_i != -1) {
                var character_next_to_ip2 = modified_substring.charAt(position_of_i + 2);
                var character_to_be_replaced = "fa" + character_next_to_ip2;
                modified_substring = modified_substring.replace(character_to_be_replaced, character_next_to_ip2 + "िं");
                position_of_i = modified_substring.search(/fa/, position_of_i + 2);
            } // end while

            // ── Pass 2e: Glyph Ê  →  long-ī mātrā + reph marker ─────────────
            // Seen in words like "किंकर" where Ê encodes the ī + reph combination.
            modified_substring = modified_substring.replace(/Ê/g, "ीZ");

            /*
            // (Commented-out alternative "h" repositioning — preserved for reference)
            var position_of_i = modified_substring.indexOf( "h" )
            while ( position_of_i != -1 )
            {
                var character_next_to_i = modified_substring.charAt( position_of_i + 1 )
                var character_to_be_replaced = "h" + character_next_to_i
                modified_substring = modified_substring.replace( character_to_be_replaced , character_next_to_i + "ी" )
                position_of_i = modified_substring.search( /h/ , position_of_i + 1 )
            }
            */

            // ── Pass 2f: Fix spurious "ि्" (iMatra on a half-consonant) ──────
            // A side-effect of Pass 2c: if the consonant immediately following "f"
            // already carried a halant (्), the iMatra lands incorrectly on the
            // half-consonant.  Move it past the halant to the canonical position.
            var position_of_wrong_ee = modified_substring.indexOf("ि्");
            while (position_of_wrong_ee != -1) {
                var consonent_next_to_wrong_ee = modified_substring.charAt(position_of_wrong_ee + 2);
                var character_to_be_replaced = "ि्" + consonent_next_to_wrong_ee;
                modified_substring = modified_substring.replace(character_to_be_replaced, "्" + consonent_next_to_wrong_ee + "ि");
                position_of_wrong_ee = modified_substring.search(/ि्/, position_of_wrong_ee + 2);
            } // end while

            // ── Pass 2g: Reph "Z"  →  "र्"  (reposition before host cluster) ─
            //
            // KrutiDev places the reph marker "Z" AFTER the syllable it belongs to.
            // Unicode requires "र्" to appear BEFORE the full consonant cluster.
            //
            // Algorithm for each "Z" found:
            //  1. Locate "Z" in the string.
            //  2. Walk LEFT past any mātrā characters (vowel signs, anusvāra, etc.).
            //  3. Also walk LEFT past any halant-linked consonants so the reph
            //     precedes the entire conjunct, not just the final consonant.
            //  4. Extract the substring between the computed anchor and "Z".
            //  5. Replace  (substring + "Z")  with  ("र्" + substring).
            var set_of_matras = "अ आ इ ई उ ऊ ए ऐ ओ औ ा ि ी ु ू ृ े ै ो ौ ं : ँ ॅ";
            var position_of_R = modified_substring.indexOf("Z");

            while (position_of_R > 0) {
                var probable_position_of_half_r = position_of_R - 1;
                var character_at_probable_position_of_half_r = modified_substring.charAt(probable_position_of_half_r);

                // Step 2: walk left across mātrā characters
                while (set_of_matras.match(character_at_probable_position_of_half_r) != null) {
                    probable_position_of_half_r = probable_position_of_half_r - 1;
                    character_at_probable_position_of_half_r = modified_substring.charAt(probable_position_of_half_r);
                } // end while

                var previous_to_position_of_half_r = probable_position_of_half_r - 1;

                if (previous_to_position_of_half_r > 0) {
                    var character_previous_to_position_of_half_r = modified_substring.charAt(previous_to_position_of_half_r);

                    // Step 3: also walk left across halant-linked consonants
                    while ("्".match(character_previous_to_position_of_half_r) != null) {
                        probable_position_of_half_r = previous_to_position_of_half_r - 1;
                        character_at_probable_position_of_half_r = modified_substring.charAt(probable_position_of_half_r);
                        previous_to_position_of_half_r = probable_position_of_half_r - 1;
                        character_previous_to_position_of_half_r = modified_substring.charAt(previous_to_position_of_half_r);
                    } // end while
                } // end if

                // Steps 4 & 5: extract the substring and perform the swap
                var character_to_be_replaced = modified_substring.substr(probable_position_of_half_r, (position_of_R - probable_position_of_half_r));
                var new_replacement_string = "र्" + character_to_be_replaced;
                character_to_be_replaced = character_to_be_replaced + "Z";
                modified_substring = modified_substring.replace(character_to_be_replaced, new_replacement_string);
                position_of_R = modified_substring.indexOf("Z");
            } // end while

        } // end if (non-blank chunk guard)

    } // end Replace_Symbols

} // end convert_to_unicode

// ─────────────────────────────────────────────────────────────────────────────
//  Unicode Devanagari → KrutiDev 010  (inverse conversion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts Unicode Devanagari text back to KrutiDev 010 legacy encoding.
 * This is the functional inverse of convert_to_unicode().
 *
 * Processing order applied to every chunk:
 *  Step 1 — Normalise two-byte nukta varṇas to one-byte equivalents.
 *  Step 2 — Reposition iMatra ि  →  "f"  (one slot to the LEFT).
 *  Step 3 — Reposition reph "र्"  →  "Z"  (after the host consonant cluster).
 *  Step 4 — Exhaustive 1-to-1 substitution (array_one → array_two, Unicode → KrutiDev).
 *  Step 5 — Post-substitution corrections for three known artefact sequences
 *            (Zksa, ~ Z, Zk) and Zh → Ê ligature.
 */
function Convert_to_Krutidev_010() {
    setTimer();

    /* ── Lookup Tables ────────────────────────────────────────────────────────
     *
     * ⚠  ORDERING IS CRITICAL — conjuncts and longer sequences MUST appear
     *    before their component consonants (longest-match-first), otherwise
     *    a shorter entry will be substituted before the longer one is tried.
     *
     * ──────────────────────────────────────────────────────────────────────── */
    var array_one = new Array(
        // ignore all nuktas except in ड़ and ढ़
        "'", "'", "\u201c", "\u201d", "(", ")", "{", "}", "=", "।", "?", "-", "µ", "॰", ",", ".", "् ",
        "०", "१", "२", "३", "४", "५", "६", "७", "८", "९", "x", "+", ";", "_",
        "फ़्", "क़", "ख़", "ग़", "ज़्", "ज़", "ड़", "ढ़", "फ़", "य़", "ऱ", "ऩ", // one-byte nukta varNas
        "त्त्", "त्त", "क्त", "दृ", "कृ",
        "श्व", "ह्न", "ह्य", "हृ", "ह्म", "ह्र", "ह्", "द्द", "क्ष्", "क्ष", "त्र्", "त्र", "ज्ञ",
        "छ्य", "ट्य", "ठ्य", "ड्य", "ढ्य", "द्य", "द्व",
        "श्र", "ट्र", "ड्र", "ढ्र", "छ्र", "क्र", "फ्र", "द्र", "प्र", "ग्र", "रु", "रू",
        "्र",
        "ओ", "औ", "आ", "अ", "ई", "इ", "उ", "ऊ", "ऐ", "ए", "ऋ",
        "क्", "क", "क्क", "ख्", "ख", "ग्", "ग", "घ्", "घ", "ङ",
        "चै", "च्", "च", "छ", "ज्", "ज", "झ्", "झ", "ञ",
        "ट्ट", "ट्ठ", "ट", "ठ", "ड्ड", "ड्ढ", "ड", "ढ", "ण्", "ण",
        "त्", "त", "थ्", "थ", "द्ध", "द", "ध्", "ध", "न्", "न",
        "प्", "प", "फ्", "फ", "ब्", "ब", "भ्", "भ", "म्", "म",
        "य्", "य", "र", "ल्", "ल", "ळ", "व्", "व",
        "श्", "श", "ष्", "ष", "स्", "स", "ह",
        "ऑ", "ॉ", "ो", "ौ", "ा", "ी", "ु", "ू", "ृ", "े", "ै",
        "ं", "ँ", "ः", "ॅ", "ऽ", "् ", "्", "़", "/");

    var array_two = new Array(
        "^", "*", "Þ", "ß", "¼", "½", "¿", "À", "¾", "A", "\\", "&", "&", "Œ", "]", "-", "~ ",
        "å", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Û", "$", "(", "&",
        // "¶","d","[k","x","T","t","M+","<+","Q",";","j","u",
        "¶+", "d+", "[k+", "x+", "T+", "t+", "M+", "<+", "Q+", ";+", "j+", "u+",
        "Ù", "Ùk", "ä", "–", "—",
        "Üo", "à", "á", "â", "ã", "ºz", "º", "í", "{", "{k", "«", "=", "K",
        "Nî", "Vî", "Bî", "Mî", "<î", "|", "}",
        "J", "Vª", "Mª", "<ªª", "Nª", "Ø", "Ý", "æ", "ç", "xz", "#", ":",
        "z",
        "vks", "vkS", "vk", "v", "bZ", "b", "m", "Å", ",s", ",", "_",
        "D", "d", "ô", "[", "[k", "X", "x", "?", "?k", "³",
        "pkS", "P", "p", "N", "T", "t", "÷", ">", "¥",
        "ê", "ë", "V", "B", "ì", "ï", "M", "<", ".", ".k",
        "R", "r", "F", "Fk", ")", "n", "è", "èk", "U", "u",
        "I", "i", "¶", "Q", "C", "c", "H", "Hk", "E", "e",
        "¸", ";", "j", "Y", "y", "G", "O", "o",
        "'", "'k", "\"", "\"k", "L", "l", "g",
        "v‚", "‚", "ks", "kS", "k", "h", "q", "w", "`", "s", "S",
        "a", "¡", "%", "W", "·", "~ ", "~", "+", "@"); // "~j"

    // Notes on characters requiring positional logic (handled in Steps 2 & 3):
    //   "र्" (reph)  →  "Z"
    //   "ि"          →  "f"
    // (Put "Enter chunk size:" input before the unicode_text textarea if needed.)
    // var max_text_size = chunksize; // Uncomment to use a user-defined chunk size
    // alert(max_text_size);

    /* ── Chunk-Based Processing ───────────────────────────────────────────────
     * Mirrors the chunking strategy of convert_to_unicode().
     * ──────────────────────────────────────────────────────────────────────── */
    var array_one_length = array_one.length;
    var modified_substring = document.getElementById("unicode_text").value;
    var text_size = document.getElementById("unicode_text").value.length;
    var processed_text = ''; // Accumulates fully converted output across all chunks
    var sthiti1 = 0;
    var sthiti2 = 0;
    var chale_chalo = 1;
    var max_text_size = 6000;

    while (chale_chalo == 1) {
        sthiti1 = sthiti2;

        if (sthiti2 < (text_size - max_text_size)) {
            sthiti2 += max_text_size;
            // Walk back to the nearest space so we never split a word across chunks
            while (document.getElementById("unicode_text").value.charAt(sthiti2) != ' ') {
                sthiti2--;
            }
        } else {
            // Final chunk — consume everything that remains
            sthiti2 = text_size;
            chale_chalo = 0;
        }

        var modified_substring = document.getElementById("unicode_text").value.substring(sthiti1, sthiti2);
        Replace_Symbols();
        processed_text += modified_substring;
        document.getElementById("legacy_text").value = processed_text;
    }

    // ── Inner Conversion Worker ───────────────────────────────────────────────
    /**
     * Replace_Symbols()
     *
     * Operates directly on the outer closure variable `modified_substring`.
     * Note: Steps 5 (post-substitution fixes) run even on blank input because
     * they correct artefacts that may have been carried in from prior chunks.
     */
    function Replace_Symbols() {

        // Guard: skip the heavy passes for a blank chunk
        if (modified_substring != "") {

            // ── Step 1: Normalise two-byte nukta varṇas → one-byte forms ─────
            // Two-byte nukta sequences (base + ़) must be collapsed to their
            // precomposed one-byte equivalents before the main table runs,
            // otherwise the table entries for nukta varṇas will never match.
            modified_substring = modified_substring.replace(/त्र्य/g, "«य");
            modified_substring = modified_substring.replace(/श्र्य/g, "Ü‍‍zय");
            modified_substring = modified_substring.replace(/क़/, "क़");
            modified_substring = modified_substring.replace(/ख़‌/g, "ख़");
            modified_substring = modified_substring.replace(/ग़/g, "ग़");
            modified_substring = modified_substring.replace(/ज़/g, "ज़");
            modified_substring = modified_substring.replace(/ड़/g, "ड़");
            modified_substring = modified_substring.replace(/ढ़/g, "ढ़");
            modified_substring = modified_substring.replace(/ऩ/g, "ऩ");
            modified_substring = modified_substring.replace(/फ़/g, "फ़");
            modified_substring = modified_substring.replace(/य़/g, "य़");
            modified_substring = modified_substring.replace(/ऱ/g, "ऱ");

            // ── Step 2: iMatra ि  →  "f"  (reposition one slot leftward) ─────
            // Unicode places ि AFTER its consonant; KrutiDev needs "f" BEFORE it.
            // The inner while-loop handles halant-linked conjuncts, e.g. "क्रि",
            // by walking "f" further left past each halant + consonant pair.
            var position_of_f = modified_substring.indexOf("ि");
            while (position_of_f != -1) {
                var character_left_to_f = modified_substring.charAt(position_of_f - 1);
                modified_substring = modified_substring.replace(character_left_to_f + "ि", "f" + character_left_to_f);
                position_of_f = position_of_f - 1;

                // Walk left through any halant-linked consonant chain
                while ((modified_substring.charAt(position_of_f - 1) == "्") & (position_of_f != 0)) {
                    var string_to_be_replaced = modified_substring.charAt(position_of_f - 2) + "्";
                    modified_substring = modified_substring.replace(string_to_be_replaced + "f", "f" + string_to_be_replaced);
                    position_of_f = position_of_f - 2;
                } // end inner while

                position_of_f = modified_substring.search(/ि/, position_of_f + 1);
            } // end while

            // ── Step 3: Reph "र्"  →  "Z"  (reposition after host cluster) ───
            //
            // Unicode places "र्" BEFORE the consonant cluster; KrutiDev places
            // "Z" AFTER it.  Two trailing spaces are appended as a guard so that
            // charAt() at the very end of the string always returns a character
            // rather than an empty string, preventing an infinite loop.
            //
            // Algorithm for each "र्" found:
            //  1. Locate "र्" (two code-units wide).
            //  2. Walk RIGHT past any mātrā characters.
            //  3. Also walk RIGHT past any halant-linked consonants so "Z" lands
            //     after the entire conjunct cluster.
            //  4. Replace  ("र्" + substring)  →  (substring + "Z").
            var set_of_matras = "ािीुूृेैोौं:ँॅ";
            modified_substring += '  '; // Append two guard spaces before reph scan

            var position_of_half_R = modified_substring.indexOf("र्");
            while (position_of_half_R > 0) {
                // "र्" is two code-units; begin scanning two positions to the right
                var probable_position_of_Z = position_of_half_R + 2;
                var character_at_probable_position_of_Z = modified_substring.charAt(probable_position_of_Z);

                // Step 2: walk right across mātrā characters
                while (set_of_matras.match(character_at_probable_position_of_Z) != null) {
                    probable_position_of_Z = probable_position_of_Z + 1;
                    character_at_probable_position_of_Z = modified_substring.charAt(probable_position_of_Z);
                } // end while

                var right_to_position_of_Z = probable_position_of_Z + 1;

                if (right_to_position_of_Z > 0) {
                    var character_right_to_position_of_Z = modified_substring.charAt(right_to_position_of_Z);

                    // Step 3: also walk right across halant-linked consonants
                    while (character_right_to_position_of_Z == "्") {
                        probable_position_of_Z = right_to_position_of_Z + 1;
                        character_at_probable_position_of_Z = modified_substring.charAt(probable_position_of_Z);
                        right_to_position_of_Z = probable_position_of_Z + 1;
                        character_right_to_position_of_Z = modified_substring.charAt(right_to_position_of_Z);
                    } // end while
                } // end if

                // Step 4: extract the host-cluster substring and perform the swap
                var string_to_be_replaced = modified_substring.substr(position_of_half_R + 2, (probable_position_of_Z - position_of_half_R) - 1);
                modified_substring = modified_substring.replace("र्" + string_to_be_replaced, string_to_be_replaced + "Z");
                position_of_half_R = modified_substring.indexOf("र्");
            } // end while

            // Strip the two guard spaces before proceeding to symbol substitution
            modified_substring = modified_substring.substr(0, modified_substring.length - 2);

            // ── Step 4: Direct Unicode → KrutiDev symbol substitution ─────────
            // Exhaustive replacement: each array_one[i] → array_two[i].
            for (var input_symbol_idx = 0; input_symbol_idx < array_one_length; input_symbol_idx++) {
                var idx = 0;
                while (idx != -1) {
                    modified_substring = modified_substring.replace(array_one[input_symbol_idx], array_two[input_symbol_idx]);
                    idx = modified_substring.indexOf(array_one[input_symbol_idx]);
                } // end while
            } // end for

        } // end if (non-blank chunk guard)

        // ── Step 5: Post-substitution sequence corrections ────────────────────
        // These patterns are artefacts of the reph-repositioning in Step 3 and
        // can only be corrected AFTER the main substitution table has fully run.
        // They are intentionally placed OUTSIDE the blank-chunk guard so they
        // execute even when modified_substring was initially empty.
        modified_substring = modified_substring.replace(/Zksa/g, "ksZa"); // "ksa" cluster + reph ordering
        modified_substring = modified_substring.replace(/~ Z/g, "Z~");   // Avagraha + reph ordering
        modified_substring = modified_substring.replace(/Zk/g, "kZ");   // "aa" mātrā + reph ordering
        modified_substring = modified_substring.replace(/Zh/g, "Ê");    // Long-ī + reph → Ê ligature

    } // end Replace_Symbols

} // end Convert_to_Krutidev_010
