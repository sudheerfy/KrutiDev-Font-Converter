/**
 * Kruti Dev Unicode Converter - Main Logic
 * Handles initialization, event listeners, and UI interactions.
 */

document.addEventListener('DOMContentLoaded', function () {
    // Initialize Tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

    // Event Listeners for Buttons
    document.getElementById('inscriptEnable').addEventListener('change', toggleLayout);

    // Unicode Text Area Actions
    document.getElementById('btn-purnviram').addEventListener('click', purnviram);
    document.getElementById('btn-copy-unicode').addEventListener('click', copy_data_unicode);
    document.getElementById('btn-clear-unicode').addEventListener('click', clear_data_unicode);
    document.getElementById('btn-convert-krutidev').addEventListener('click', function (e) {
        e.preventDefault();
        Convert_to_Krutidev_010();
    });

    // Legacy Text Area Actions
    document.getElementById('btn-replace-letter').addEventListener('click', replace_letter);
    document.getElementById('btn-copy-legacy').addEventListener('click', copy_data_legacy);
    document.getElementById('btn-clear-legacy').addEventListener('click', clear_data_legacy);
    document.getElementById('btn-convert-unicode').addEventListener('click', function (e) {
        e.preventDefault();
        convert_to_unicode();
    });

    // Initialize Layout based on checkbox state
    toggleLayout();
});

// --- Unicode Section Functions ---

function purnviram() {
    const unicodeText = document.getElementById("unicode_text");
    unicodeText.value += '।';
    unicodeText.focus();
}

function copy_data_unicode() {
    const unicodeText = document.getElementById('unicode_text');
    unicodeText.select();
    document.execCommand('copy'); // Fallback for older browsers
    // Modern approach: navigator.clipboard.writeText(unicodeText.value);
}

function clear_data_unicode() {
    document.getElementById('unicode_text').value = "";
}

// --- Legacy Section Functions ---

function replace_letter() {
    const el = document.getElementById("legacy_text");
    let text = el.value;
    let newText = "";

    for (let i = 0; i < text.length; i++) {
        if (text[i] === "'") {
            newText += '"';
        } else if (text[i] === '"') {
            newText += "'";
        } else {
            newText += text[i];
        }
    }
    el.value = newText;
}

function copy_data_legacy() {
    const legacyText = document.getElementById('legacy_text');
    legacyText.select();
    document.execCommand('copy');
}

function clear_data_legacy() {
    document.getElementById('legacy_text').value = "";
}

// --- Layout Toggling Logic ---

var currentKeyboard = null;

function attachInscript(elementId) {
    if (!$('#keyboard').length) {
        $('body').append('<div id="keyboard"></div>');
    }

    // Clean up existing keyboard instance if any
    if (currentKeyboard) {
        currentKeyboard = null;
    }

    // Use global RTSPL object from InscriptKeyBoard.js
    if (typeof RTSPL !== 'undefined') {
        currentKeyboard = new RTSPL.keyboard("keyboard", elementId);
        currentKeyboard.fontSize = 16;
        if (RTSPL.DevanagariLayout) {
            currentKeyboard.loadVirtualLayout(RTSPL.DevanagariLayout);
        } else {
            // If DevanagariLayout is missing, try loading default or handle error
            // console.warn("RTSPL.DevanagariLayout not found, using default.");
            // currentKeyboard.loadVirtualLayout(currentKeyboard.defaultLayout); // Fallback if exists
            // Note: InscriptKeyBoard.js defines layouts? It seems RTSPL.DevanagariLayout might be defined in another file or inline?
            // Checking the previous file content, InscriptKeyBoard.js defines RTSPL.layout but doesn't explicitly export DevanagariLayout at the bottom.
            // It might be expected to be defined. I will keep this check.
        }
    }
}

function manualReset(elementId) {
    var el = document.getElementById(elementId);
    if (!el) return null;
    var clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
}

function toggleLayout() {
    var isChecked = document.getElementById('inscriptEnable').checked;
    var el = document.getElementById('unicode_text');

    // Save cursor position and selection range
    var startPos = el.selectionStart;
    var endPos = el.selectionEnd;
    var scrollTop = el.scrollTop;

    // 1. Reset: Force remove all listeners by cloning the node
    // Use window.disableTransliteration if available
    if (window.disableTransliteration) {
        try {
            window.disableTransliteration(el);
        } catch (e) {
            console.error("Transliteration disable failed", e);
            manualReset('unicode_text');
        }
    } else {
        manualReset('unicode_text');
    }

    // Refresh element reference after replacement
    el = document.getElementById('unicode_text');
    // We lost event listeners on the cloned element, but for 'unicode_text' specifically, 
    // it is mostly passive text area for input. 
    // However, if we attached any other specific listeners to it (like 'input'), we would need to re-attach them.
    // In this app, the buttons control the actions, so it should be fine.

    if (isChecked) {
        // Switch to Inscript
        if (typeof RTSPL !== 'undefined') {
            attachInscript('unicode_text');
        }
        var label = document.getElementById('modeLabel');
        if (label) label.innerText = "Mangal (Inscript)";
    } else {
        // Switch to Phonetic
        if (window.enableTransliteration) {
            window.enableTransliteration(el, 'hi');
        }
        var label = document.getElementById('modeLabel');
        if (label) label.innerText = "Mangal (Phonetic)";
    }

    // Restore cursor position, selection range, and focus
    el.focus();
    // Setting selection range might fail if element is not focused or type is not text/search/etc.
    // Textarea supports it.
    try {
        el.setSelectionRange(startPos, endPos);
        el.scrollTop = scrollTop;
    } catch (e) {
        console.log("Could not restore selection", e);
    }
}
