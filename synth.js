document.addEventListener('DOMContentLoaded', () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);

    // voices tracked to stop later
    let activeVoices = {};

    const ui = {
        mode: document.getElementById('synthMode'),
        mode: document.getElementById('modFreq'),
        mode: document.getElementById('modeDepth'),
        mode: document.getElementById('lfoRate')
    };

    // synth function
    function playNote(key, freq) {
        const now = audioCtx.currentTime;

        // curr values from sliders
        const mode = ui.mode.value;
        const mFreq = parseFloat(ui.modFreq.value);
        const mDepth = parseFloat(ui.modeDepth.value);
        const lRate =  parseFloat(ui.lfoRate.value);

        // envelope
        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(1, now + 0.95);
        noteGain.connect(masterGain);

        const nodes = []

        // LFO setup
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = lRate;
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfo.start();
        nodes.push(lfo)

        // selecting the mode
        if (mode === 'additive') {
            [1, 2, 3].forEach((ratio) => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq * ratio;

                const oscGain = audioCtx.createGain();
                oscGain.gain.value = 0.33;

                lfoGain.connect(osc.frequency); // vibrato

                osc.connect(oscGain);
                oscGain.connect(noteGain);
                osc.start();
                nodes.push(osc);
            });
        } else if (mode === 'fm') {
            //fm modulator, mods carrier freq
            const carrier = audioCtx.createOscillator();
            const modulator = audioCtx.createOscillator();
            const modGain = audioCtx.createGain();

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
        } else if (mode == 'am') {
            // similar logic for am
            const carrier = audioCtx.createOscillator();
            const modulator = audioCtx.createOscillator();
            const amGain = audioCtx.createGain();
            const modScalar = audioCtx.createGain();

            carrier.frequency.value = freq;
            modulator.frequency.value = mFreq;

            amGain.gain.value = 0.5;
            modScalar.gain.value = 0.5;

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

        // fade
        voice.master.gain.cancelScheduledValues(now);
        voice.master.gain.setValueAtTime(voice.master.gain.value, now);
        voice.master.gain.linearRampToValueAtTime(0, now + 0.2);

        // stop the osc
        voice.nodes.forEach(n => {
            if (n.stop) n.stop(now + 0.2);
        });
        delete activeVoices[key];
    }

    const keyMap = { 
        '90': 261.63, '83': 277.18, '88': 293.66, '68': 311.13, '67': 329.63, 
        '86': 349.23, '71': 369.99, '66': 392.00, '72': 415.30, '78': 440.00, 
        '74': 466.16, '77': 493.88, '81': 523.25, '50': 554.37, '87': 587.33, 
        '51': 622.25, '69': 659.26, '82': 698.46, '53': 739.99, '84': 783.99, 
        '54': 830.61, '89': 880.00, '55': 932.33, '85': 987.77 
    };

    const chords = {
        'C Major': ['90', '67', '66'],
        'C Minor': ['90', '68', '66'],
        'C Dim':   ['90', '68', '71'],
        'C Aug':   ['90', '67', '72']
    };


    function checkChord() {
        const pressed = Object.keys(activeVoices);
        const disp = document.getElementById('chord-display');
        disp.innerText = '';

        for (const [name, keys] of Object.entries(chords)) {
            if (keys.every(k => pressed.includes(k))) {
                disp.innerText = name + ' 🎵';
                return
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