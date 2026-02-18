document.addEventListener('DOMContentLoaded', () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);

    // voices tracked to stop later
    let activeVoices = {};
    let releasingVoices = [];

    const ui = {
        mode:     document.getElementById('synthMode'),
        waveform: document.getElementById('waveform'),  
        modFreq:  document.getElementById('modFreq'),
        modDepth: document.getElementById('modDepth'),
        lfoRate:  document.getElementById('lfoRate'),
        lfoDepth: document.getElementById('lfoDepth'),  
    };

    // helper function for checking voices
    function activeVoiceCount() {
        return Object.keys(activeVoices).length + releasingVoices.length;
    }

    // synth function
    function playNote(key, freq) {
        const now = audioCtx.currentTime;

        // curr values from sliders
        const mode = ui.mode.value;
        const waveform = ui.waveform ? ui.waveform.value : 'sine';
        const mFreq = parseFloat(ui.modFreq.value);
        const mDepth = parseFloat(ui.modDepth.value);
        const lRate =  parseFloat(ui.lfoRate.value);
        const lDepth = ui.lfoDepth ? parseFloat(ui.lfoDepth.value) : 10;

        const MAX_VOICES = 10;
        const voiceGain = 1.0 / Math.max(activeVoiceCount() + 1, 1);

        const attack = 0.02;
        const decay = 0.1;
        const sustain = 0.7;

        // envelope
        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(voiceGain, now + attack);
        noteGain.gain.linearRampToValueAtTime(sustain * voiceGain, now + attack + decay);
        noteGain.connect(masterGain);

        const nodes = []

        // LFO setup
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = lRate;
        lfoGain.gain.value = lDepth;
        lfo.connect(lfoGain);
        lfo.start();
        nodes.push(lfo)

        // selecting the mode
        if (mode === 'additive') {
            const numPartials = 3; 
            const partialGain = 1.0 / numPartials
            for (let i = 1; i <= numPartials; i++) {
                const osc = audioCtx.createOscillator();
                osc.type = waveform;
                osc.frequency.value = freq * i;

                const oscGain = audioCtx.createGain();
                oscGain.gain.value = partialGain;

                lfoGain.connect(osc.frequency); // vibrato

                osc.connect(oscGain);
                oscGain.connect(noteGain);
                osc.start();
                nodes.push(osc);
            }
        } else if (mode === 'fm') {
            //fm modulator, mods carrier freq
            const carrier = audioCtx.createOscillator();
            const modulator = audioCtx.createOscillator();
            const modGain = audioCtx.createGain();

            carrier.type = waveform;
            carrier.frequency.value = freq;
            modulator.frequency.value = mFreq;
            modGain.gain.value = mDepth;

            modulator.connect(modGain);
            modGain.connect(carrier.frequency);

            lfoGain.connect(carrier.frequency);

            carrier.connect(noteGain);

            modulator.start();
            carrier.start();
            nodes.push(modulator, carrier);
        } else if (mode === 'am') {
            // similar logic for am
            const carrier = audioCtx.createOscillator();
            const modulator = audioCtx.createOscillator();
            const amGain = audioCtx.createGain();
            const modScalar = audioCtx.createGain();

            const dcOffset = audioCtx.createConstantSource();
            dcOffset.offset.value = 0.5;
            dcOffset.start();
            nodes.push(dcOffset);
            
            carrier.type = waveform;
            carrier.frequency.value = freq;
            modulator.frequency.value = mFreq;

            amGain.gain.value = 0;
            modScalar.gain.value = (mDepth / 1000) * 0.5;

            dcOffset.connect(amGain.gain);
            modulator.connect(modScalar);
            modScalar.connect(amGain.gain);

            lfoGain.connect(carrier.frequency);

            carrier.connect(amGain);
            amGain.connect(noteGain);

            modulator.start();
            carrier.start();
            nodes.push(modulator, carrier);
        }

        activeVoices[key] = { nodes: nodes, master: noteGain };
    }

    // release note
    function releaseNote(key) {
        if (!activeVoices[key]) return;
        const now = audioCtx.currentTime;
        const voice = activeVoices[key];
        const release = 0.2;

        // fade
        voice.master.gain.cancelScheduledValues(now);
        voice.master.gain.setValueAtTime(voice.master.gain.value, now);
        voice.master.gain.linearRampToValueAtTime(0, now + release);

        // stop the osc
        voice.nodes.forEach(n => {
            if (n.stop) n.stop(now + 0.2);
        });

        releasingVoices.push(voice);
        delete activeVoices[key];

        const lastOsc = voice.nodes[voice.nodes.length - 1];
        if (lastOsc && lastOsc.onended !== undefined) {
            lastOsc.onended = () => {
                releasingVoices = releasingVoices.filter(v => v !== voice);
            };
        }
    }

    const keyMap = { 
        '90': 261.63, '83': 277.18, '88': 293.66, '68': 311.13, '67': 329.63, 
        '86': 349.23, '71': 369.99, '66': 392.00, '72': 415.30, '78': 440.00, 
        '74': 466.16, '77': 493.88, '81': 523.25, '50': 554.37, '87': 587.33, 
        '51': 622.25, '69': 659.26, '82': 698.46, '53': 739.99, '84': 783.99, 
        '54': 830.61, '89': 880.00, '55': 932.33, '85': 987.77 
    };

    const chords = {
        'C Major':      ['90', '67', '66'],  // Z + C + B (C, E, G)
        'C Minor':      ['90', '68', '66'],  // Z + D + B (C, Eb, G)
        'C Diminished': ['90', '68', '71'],  // Z + D + G (C, Eb, Gb)
        'C Augmented':  ['90', '67', '72'],  // Z + C + H (C, E, G#)
        'C Sus2':       ['90', '88', '66'],  // Z + X + B (C, D, G)
        'C Sus4':       ['90', '86', '66'],  // Z + V + B (C, F, G)

        // 7th chords (4 notes)
        'C Major 7':    ['90', '67', '66', '77'],  // Z + C + B + M (C, E, G, B)
        'C Minor 7':    ['90', '68', '66', '74'],  // Z + D + B + J (C, Eb, G, Bb)
        'C7':           ['90', '67', '66', '74'],  // Z + C + B + J (C, E, G, Bb)
        'C Dim 7':      ['90', '68', '71', '78'],  // Z + D + G + N (C, Eb, Gb, A)

        // some others
        'C Add9':       ['90', '67', '66', '88'],  // Z + C + B + X (C, E, G, D)
        'C6':           ['90', '67', '66', '78'],  // Z + C + B + N (C, E, G, A)
    };
    


    function checkChord() {
        const pressed = Object.keys(activeVoices);
        const disp = document.getElementById('chord-display');
        
        // Reset display if no keys are pressed
        if (pressed.length === 0) {
            disp.innerText = '';
            return;
        }

        disp.innerText = ''; // Clear previous

        for (const [name, keys] of Object.entries(chords)) {
            if (pressed.length === keys.length && keys.every(k => pressed.includes(k))) {
                disp.innerText = name + ' 🎵';
                return; 
            }
        }
    }

    // event listeners
    window.addEventListener('keydown', (e) => {
        const k = (e.detail || e.which).toString();
        if (keyMap[k] && !activeVoices[k]) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            playNote(k, keyMap[k]);
            checkChord();
        }  
    });

    window.addEventListener('keyup', (e) => {
        const k = (e.detail || e.which).toString();
        if (activeVoices[k]) {
            releaseNote(k);
            checkChord();
        }
    });
})