/* =========================================================================
   Keyla - Asistente Domótico por Voz
   Módulos: VoiceRecognizer, VoiceSynthesizer, DeviceManager,
            CommandParser, MorningReport, ConversationHistory
   ========================================================================= */

(function () {
    'use strict';

    // =========================================================================
    // VOICE RECOGNIZER - Reconocimiento de voz mediante Web Speech API
    // =========================================================================
    const VoiceRecognizer = {
        recognition: null,
        isListening: false,
        finalTranscript: '',

        init(onResultCallback, onErrorCallback, onStartCallback, onEndCallback) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                onErrorCallback && onErrorCallback('Tu navegador no soporta el reconocimiento de voz. Por favor usa Chrome o Edge.');
                return false;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'es-ES';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 3;

            this.recognition.onstart = () => {
                this.isListening = true;
                onStartCallback && onStartCallback();
            };

            this.recognition.onresult = (event) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        this.finalTranscript += transcript + ' ';
                    } else {
                        interim += transcript;
                    }
                }
                if (interim) {
                    onResultCallback && onResultCallback(interim.trim(), false);
                }
                if (this.finalTranscript.trim()) {
                    onResultCallback && onResultCallback(this.finalTranscript.trim(), true);
                    this.finalTranscript = '';
                }
            };

            this.recognition.onerror = (event) => {
                let msg = 'Error de reconocimiento';
                switch (event.error) {
                    case 'not-allowed':
                    case 'service-not-allowed':
                        msg = 'Permiso de micrófono denegado. Por favor habilita el micrófono en la configuración del navegador.';
                        break;
                    case 'no-speech':
                        msg = 'No se detectó voz. Intenta hablar más cerca del micrófono.';
                        break;
                    case 'audio-capture':
                        msg = 'No hay micrófono disponible en tu dispositivo.';
                        break;
                    case 'network':
                        msg = 'Error de red: el reconocimiento necesita conexión a internet.';
                        break;
                }
                onErrorCallback && onErrorCallback(msg);
            };

            this.recognition.onend = () => {
                this.isListening = false;
                onEndCallback && onEndCallback();
            };

            return true;
        },

        start() {
            if (this.recognition && !this.isListening) {
                this.finalTranscript = '';
                try {
                    this.recognition.start();
                } catch (e) { /* already started */ }
            }
        },

        stop() {
            if (this.recognition && this.isListening) {
                this.recognition.stop();
            }
        },

        toggle() {
            if (this.isListening) this.stop();
            else this.start();
            return this.isListening;
        }
    };

    // =========================================================================
    // VOICE SYNTHESIZER - Síntesis de voz con SpeechSynthesis (Femenina Forzada)
    // =========================================================================
    const VoiceSynthesizer = {
        synth: window.speechSynthesis,
        spanishFemaleVoice: null,
        speakingQueue: [],
        isSpeaking: false,

        femaleVoiceNames: [
            'helena', 'laura', 'paulina', 'sabina', 'violeta', 'ines', 'inesa',
            'abril', 'luciana', 'maria', 'marina', 'miriam', 'miryam', 'marta',
            'garbina', 'isabel', 'carmen', 'lucia', 'lucy', 'roxana', 'silvia',
            'monica', 'patricia', 'sandra', 'ana', 'diana', 'elena', 'eva',
            'julia', 'pilar', 'raquel', 'sara', 'tania', 'veronica', 'victoria',
            'xiomara', 'yesenia', 'karla', 'ximena', 'dani', 'daniela',
            'female', 'mujer', 'mujer espanola', 'woman', 'girl'
        ],

        scoreVoice(v) {
            let score = 0;
            const lang = (v.lang || '').toLowerCase();
            const name = (v.name || '').toLowerCase();
            const uri = (v.voiceURI || '').toLowerCase();
            const haystack = (name + ' ' + uri).toLowerCase();

            if (lang.startsWith('es')) {
                if (lang === 'es-es') score += 100;
                else if (lang.startsWith('es-')) score += 85;
                else score += 70;
            }
            for (const n of this.femaleVoiceNames) {
                if (haystack.includes(n)) { score += 60; break; }
            }
            if (/female|mujer|woman|girl/.test(haystack)) score += 50;
            if (/male|hombre|man|guy/.test(haystack)) score -= 80;
            if (v.default && lang.startsWith('es')) score += 5;
            return score;
        },

        loadVoicesInternal() {
            const voices = this.synth.getVoices();
            if (!voices || voices.length === 0) return;
            let best = null;
            let bestScore = -Infinity;
            for (const v of voices) {
                const s = this.scoreVoice(v);
                if (s > bestScore) { bestScore = s; best = v; }
            }
            if (!best) best = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('es')) || voices[0];
            this.spanishFemaleVoice = best;
        },

        init() {
            if (!this.synth) return;
            this.loadVoicesInternal();
            this.synth.onvoiceschanged = () => this.loadVoicesInternal();
            if (typeof this.synth.onvoiceschanged !== 'function' || !this.spanishFemaleVoice) {
                setTimeout(() => this.loadVoicesInternal(), 200);
                setTimeout(() => this.loadVoicesInternal(), 800);
                setTimeout(() => this.loadVoicesInternal(), 1500);
            }
        },

        speak(text, onStart, onEnd) {
            if (!this.synth) {
                onEnd && onEnd();
                return;
            }
            this.synth.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 0.98;
            utterance.pitch = 1.28;
            utterance.volume = 1;
            if (this.spanishFemaleVoice) {
                try { utterance.voice = this.spanishFemaleVoice; }
                catch (e) { /* ignore */ }
            }

            utterance.onstart = () => {
                this.isSpeaking = true;
                onStart && onStart();
            };
            utterance.onend = () => {
                this.isSpeaking = false;
                onEnd && onEnd();
            };
            utterance.onerror = () => {
                this.isSpeaking = false;
                onEnd && onEnd();
            };
            this.synth.speak(utterance);
        },

        stop() {
            if (this.synth) this.synth.cancel();
            this.isSpeaking = false;
        }
    };

    // =========================================================================
    // DEVICE MANAGER - Gestión de estado de dispositivos (36 dispositivos)
    // =========================================================================
    const DeviceManager = {
        devices: (() => {
            const o = {};
            ['floor1','floor2','floor3','floor4','floor5'].forEach(f => o[f] = false);
            ['cochera','banos','hall','comedor','lavanderia','pasillos'].forEach(a => o['floor1-'+a] = false);
            ['cocina','sala','comedor','hab1','hab2','bano'].forEach(a => o['floor2-'+a] = false);
            ['habprincipal','banoprincipal','vestidor','salaestar','balcon','pasillos'].forEach(a => o['floor3-'+a] = false);
            ['hab3','hab4','bano','salajuegos','estudio','terraza'].forEach(a => o['floor4-'+a] = false);
            ['gimnasio','salon','bar','bano','terraza','servicio'].forEach(a => o['floor5-'+a] = false);
            ['patio','wifi','ventilador','tv','ac','cafetera'].forEach(k => o[k] = false);
            return o;
        })(),

        floorRooms: {
            floor1: ['floor1-cochera','floor1-banos','floor1-hall','floor1-comedor','floor1-lavanderia','floor1-pasillos'],
            floor2: ['floor2-cocina','floor2-sala','floor2-comedor','floor2-hab1','floor2-hab2','floor2-bano'],
            floor3: ['floor3-habprincipal','floor3-banoprincipal','floor3-vestidor','floor3-salaestar','floor3-balcon','floor3-pasillos'],
            floor4: ['floor4-hab3','floor4-hab4','floor4-bano','floor4-salajuegos','floor4-estudio','floor4-terraza'],
            floor5: ['floor5-gimnasio','floor5-salon','floor5-bar','floor5-bano','floor5-terraza','floor5-servicio']
        },

        environmentMapByAlias: {
            'cochera': 'floor1-cochera', 'cocheras': 'floor1-cochera', 'garaje': 'floor1-cochera',
            'banos sociales': 'floor1-banos', 'bano social': 'floor1-banos',
            'banos de visita': 'floor1-banos', 'bano planta baja': 'floor1-banos',
            'bano social piso 1': 'floor1-banos',
            'hall': 'floor1-hall', 'hall entrada': 'floor1-hall',
            'entrada': 'floor1-hall', 'entrada principal': 'floor1-hall',
            'comedor diario': 'floor1-comedor', 'comedor diario piso 1': 'floor1-comedor',
            'lavanderia': 'floor1-lavanderia', 'deposito': 'floor1-lavanderia',
            'deposito piso 1': 'floor1-lavanderia',
            'pasillos piso 1': 'floor1-pasillos', 'pasillo piso 1': 'floor1-pasillos',
            'pasillos planta baja': 'floor1-pasillos',

            'cocina': 'floor2-cocina', 'cocina piso 2': 'floor2-cocina',
            'sala': 'floor2-sala', 'sala principal': 'floor2-sala',
            'sala piso 2': 'floor2-sala', 'salon piso 2': 'floor2-sala',
            'comedor principal': 'floor2-comedor', 'comedor piso 2': 'floor2-comedor',
            'habitacion 1': 'floor2-hab1', 'habitacion uno': 'floor2-hab1',
            'hab 1': 'floor2-hab1', 'cuarto 1': 'floor2-hab1', 'cuarto uno': 'floor2-hab1',
            'habitacion 2': 'floor2-hab2', 'habitacion dos': 'floor2-hab2',
            'hab 2': 'floor2-hab2', 'cuarto 2': 'floor2-hab2',
            'bano piso 2': 'floor2-bano', 'banio piso 2': 'floor2-bano',

            'habitacion principal': 'floor3-habprincipal', 'hab principal': 'floor3-habprincipal',
            'cuarto principal': 'floor3-habprincipal', 'habitacion matrimonial': 'floor3-habprincipal',
            'bano principal': 'floor3-banoprincipal', 'banio principal': 'floor3-banoprincipal',
            'bano matrimonio': 'floor3-banoprincipal', 'banio matrimonio': 'floor3-banoprincipal',
            'vestidor': 'floor3-vestidor', 'vestidores': 'floor3-vestidor', 'closet': 'floor3-vestidor',
            'sala de estar': 'floor3-salaestar', 'salaestar': 'floor3-salaestar',
            'estar': 'floor3-salaestar', 'family room': 'floor3-salaestar',
            'balcon': 'floor3-balcon', 'balcon piso 3': 'floor3-balcon',
            'pasillos piso 3': 'floor3-pasillos', 'pasillo piso 3': 'floor3-pasillos',

            'habitacion 3': 'floor4-hab3', 'hab 3': 'floor4-hab3', 'cuarto 3': 'floor4-hab3',
            'habitacion 4': 'floor4-hab4', 'hab 4': 'floor4-hab4', 'cuarto 4': 'floor4-hab4',
            'bano compartido': 'floor4-bano', 'bano piso 4': 'floor4-bano', 'banio piso 4': 'floor4-bano',
            'sala de juegos': 'floor4-salajuegos', 'salajuegos': 'floor4-salajuegos',
            'juegos': 'floor4-salajuegos', 'playroom': 'floor4-salajuegos',
            'estudio': 'floor4-estudio', 'biblioteca': 'floor4-estudio',
            'terraza piso 4': 'floor4-terraza',

            'gimnasio': 'floor5-gimnasio', 'gym': 'floor5-gimnasio', 'gimnasio penthouse': 'floor5-gimnasio',
            'salon de reuniones': 'floor5-salon', 'reuniones': 'floor5-salon',
            'salon de eventos': 'floor5-salon', 'salon penthouse': 'floor5-salon',
            'bar': 'floor5-bar', 'bar penthouse': 'floor5-bar', 'barra': 'floor5-bar',
            'bano piso 5': 'floor5-bano', 'banio piso 5': 'floor5-bano',
            'bano penthouse': 'floor5-bano', 'bano visitas': 'floor5-bano',
            'terraza panoramica': 'floor5-terraza', 'terraza piso 5': 'floor5-terraza',
            'terraza penthouse': 'floor5-terraza', 'azotea': 'floor5-terraza',
            'cuarto de servicio': 'floor5-servicio', 'servicio': 'floor5-servicio',
            'cuarto servicio': 'floor5-servicio'
        },

        deviceMeta: (() => {
            const m = {
                floor1: { name: 'General Piso 1 · Planta Baja', kind: 'piso' },
                floor2: { name: 'General Piso 2 · Social', kind: 'piso' },
                floor3: { name: 'General Piso 3 · Habitacional', kind: 'piso' },
                floor4: { name: 'General Piso 4 · Familiar', kind: 'piso' },
                floor5: { name: 'General Piso 5 · Penthouse', kind: 'piso' },
                patio: { name: 'Luces del Patio', kind: 'exterior' },
                wifi: { name: 'WiFi', kind: 'red' },
                ventilador: { name: 'Ventilador', kind: 'electrodomestico' },
                tv: { name: 'Televisión', kind: 'electrodomestico' },
                ac: { name: 'Aire Acondicionado', kind: 'electrodomestico' },
                cafetera: { name: 'Cafetera', kind: 'electrodomestico' },

                'floor1-cochera': { name: 'Cochera (Piso 1)', kind: 'ambiente', piso: 1 },
                'floor1-banos': { name: 'Baños Sociales (Piso 1)', kind: 'ambiente', piso: 1 },
                'floor1-hall': { name: 'Hall de Entrada (Piso 1)', kind: 'ambiente', piso: 1 },
                'floor1-comedor': { name: 'Comedor Diario (Piso 1)', kind: 'ambiente', piso: 1 },
                'floor1-lavanderia': { name: 'Lavandería / Depósito (Piso 1)', kind: 'ambiente', piso: 1 },
                'floor1-pasillos': { name: 'Pasillos (Piso 1)', kind: 'ambiente', piso: 1 },

                'floor2-cocina': { name: 'Cocina (Piso 2)', kind: 'ambiente', piso: 2 },
                'floor2-sala': { name: 'Sala Principal (Piso 2)', kind: 'ambiente', piso: 2 },
                'floor2-comedor': { name: 'Comedor Principal (Piso 2)', kind: 'ambiente', piso: 2 },
                'floor2-hab1': { name: 'Habitación 1 (Piso 2)', kind: 'ambiente', piso: 2 },
                'floor2-hab2': { name: 'Habitación 2 (Piso 2)', kind: 'ambiente', piso: 2 },
                'floor2-bano': { name: 'Baño (Piso 2)', kind: 'ambiente', piso: 2 },

                'floor3-habprincipal': { name: 'Habitación Principal (Piso 3)', kind: 'ambiente', piso: 3 },
                'floor3-banoprincipal': { name: 'Baño Principal (Piso 3)', kind: 'ambiente', piso: 3 },
                'floor3-vestidor': { name: 'Vestidor (Piso 3)', kind: 'ambiente', piso: 3 },
                'floor3-salaestar': { name: 'Sala de Estar (Piso 3)', kind: 'ambiente', piso: 3 },
                'floor3-balcon': { name: 'Balcón (Piso 3)', kind: 'ambiente', piso: 3 },
                'floor3-pasillos': { name: 'Pasillos (Piso 3)', kind: 'ambiente', piso: 3 },

                'floor4-hab3': { name: 'Habitación 3 (Piso 4)', kind: 'ambiente', piso: 4 },
                'floor4-hab4': { name: 'Habitación 4 (Piso 4)', kind: 'ambiente', piso: 4 },
                'floor4-bano': { name: 'Baño Compartido (Piso 4)', kind: 'ambiente', piso: 4 },
                'floor4-salajuegos': { name: 'Sala de Juegos (Piso 4)', kind: 'ambiente', piso: 4 },
                'floor4-estudio': { name: 'Estudio / Biblioteca (Piso 4)', kind: 'ambiente', piso: 4 },
                'floor4-terraza': { name: 'Terraza (Piso 4)', kind: 'ambiente', piso: 4 },

                'floor5-gimnasio': { name: 'Gimnasio (Piso 5)', kind: 'ambiente', piso: 5 },
                'floor5-salon': { name: 'Salón de Reuniones (Piso 5)', kind: 'ambiente', piso: 5 },
                'floor5-bar': { name: 'Bar (Piso 5)', kind: 'ambiente', piso: 5 },
                'floor5-bano': { name: 'Baño Visitas (Piso 5)', kind: 'ambiente', piso: 5 },
                'floor5-terraza': { name: 'Terraza Panorámica (Piso 5)', kind: 'ambiente', piso: 5 },
                'floor5-servicio': { name: 'Cuarto de Servicio (Piso 5)', kind: 'ambiente', piso: 5 }
            };
            return m;
        })(),

        updateFloorAggregate(floorKey) {
            const rooms = this.floorRooms[floorKey];
            if (!rooms) return;
            const anyOn = rooms.some(r => this.devices[r]);
            const allOn = rooms.every(r => this.devices[r]);
            if (allOn && !this.devices[floorKey]) {
                this.devices[floorKey] = true;
                this.updateUIOnly(floorKey);
            } else if (!anyOn && this.devices[floorKey]) {
                this.devices[floorKey] = false;
                this.updateUIOnly(floorKey);
            } else if (anyOn && !this.devices[floorKey]) {
                this.devices[floorKey] = true;
                this.updateUIOnly(floorKey);
            } else {
                this.updateUIOnly(floorKey);
            }
        },

        setDevice(key, on) {
            if (!(key in this.devices)) return false;
            const was = this.devices[key];
            this.devices[key] = !!on;
            this.updateUI(key);
            let changedKey = key;
            let changedNowOn = this.devices[key];
            let wasChanged = was !== changedNowOn;
            let related = [];
            // Si el piso general
            if (/^floor[1-5]$/.test(key)) {
                const rooms = this.floorRooms[key] || [];
                rooms.forEach(r => {
                    const rw = this.devices[r];
                    this.devices[r] = !!on;
                    if (rw !== this.devices[r]) {
                        this.updateUIOnly(r);
                        related.push(r);
                    }
                });
                return { key, changed: wasChanged || related.length > 0, nowOn: changedNowOn, related };
            }
            // Si el subambiente
            const m = key.match(/^(floor[1-5])-/);
            if (m) this.updateFloorAggregate(m[1]);
            return { key, changed: wasChanged, nowOn: changedNowOn, related };
        },

        toggleDevice(key) {
            return this.setDevice(key, !this.devices[key]);
        },

        turnOnAllLights() {
            const all = [];
            for (let i = 1; i <= 5; i++) {
                const fk = 'floor' + i;
                (this.floorRooms[fk] || []).forEach(r => { this.setDevice(r, true); all.push(r); });
                all.push(fk);
                this.devices[fk] = true; this.updateUIOnly(fk);
            }
            this.setDevice('patio', true);
            all.push('patio');
            return all;
        },

        turnOffAllLights() {
            const all = [];
            for (let i = 1; i <= 5; i++) {
                const fk = 'floor' + i;
                (this.floorRooms[fk] || []).forEach(r => { this.setDevice(r, false); all.push(r); });
                all.push(fk);
                this.devices[fk] = false; this.updateUIOnly(fk);
            }
            this.setDevice('patio', false);
            all.push('patio');
            return all;
        },

        turnOnAllExtra() {
            const extra = ['ventilador','tv','ac','cafetera'];
            extra.forEach(k => this.setDevice(k, true));
            return extra;
        },

        turnOffAllExtra() {
            const extra = ['ventilador','tv','ac','cafetera'];
            extra.forEach(k => this.setDevice(k, false));
            return extra;
        },

        updateUIOnly(key) {
            const on = this.devices[key];
            const card = document.querySelector(`[data-device="${key}"]`);
            if (card) {
                card.classList.toggle('on', on);
                const statusEl = document.getElementById('status-' + key);
                if (statusEl) statusEl.textContent = on ? 'Encendido' : 'Apagado';
            }
        },

        updateUI(key) { this.updateUIOnly(key); },

        initUI() {
            // Acordeones
            document.querySelectorAll('.floor-card').forEach(fc => {
                const expandBtn = fc.querySelector('.floor-expand-btn');
                const header = fc.querySelector('.floor-header');
                const toggleExpand = (e) => {
                    if (e && e.target.closest('.device-toggle')) return;
                    if (e && e.target.closest('.floor-expand-btn')) {
                        e.stopPropagation();
                        fc.classList.toggle('open');
                        return;
                    }
                };
                expandBtn && expandBtn.addEventListener('click', toggleExpand);
                // Expandir el piso 2 por defecto como ejemplo
                if (fc.dataset.floor === '2') fc.classList.add('open');
            });

            // Cada dispositivo [data-device] handler general (incluyendo pisos generales y subdispositivos)
            Object.keys(this.devices).forEach(k => {
                this.updateUI(k);
                const card = document.querySelector(`[data-device="${k}"]`);
                if (!card) return;
                card.addEventListener('click', (ev) => {
                    // Evitar toggle si fue click en expand btn o toggle
                    if (ev.target.closest('.floor-expand-btn')) { ev.stopPropagation(); return; }
                    ev.stopPropagation();
                    const res = this.toggleDevice(k);
                    ConversationHistory.add('system',
                        (res.nowOn ? '🔵 Usuario activó: ' : '⚪ Usuario desactivó: ') +
                        this.getName(k) +
                        (res.related && res.related.length > 0 ? ' (y sus ambientes internos)' : ''));
                });
            });
        },

        getName(key) {
            return (this.deviceMeta[key] && this.deviceMeta[key].name) || key;
        },

        resolveEnvironmentAlias(alias, floorContext) {
            alias = (alias || '').toLowerCase().trim();
            const normalizedAlias = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            // Si contexto piso, buscar alias + contexto de piso ej "cocina piso 2" → buscar floor2-
            let matchedAlias = normalizedAlias;
            let envKey = this.environmentMapByAlias[matchedAlias];
            if (envKey) return envKey;
            // Intentar aproximación difusa por coincidencia parcial
            const entries = Object.keys(this.environmentMapByAlias);
            for (const a of entries) {
                if (matchedAlias.includes(a) || a.includes(matchedAlias)) {
                    return this.environmentMapByAlias[a];
                }
            }
            // Si con floorContext
            if (floorContext) {
                const prefix = 'floor' + floorContext + '-';
                for (const a of entries) {
                    const aCompact = a.replace(/\s+/g, '');
                    const mCompact = matchedAlias.replace(/\s+/g, '');
                    if (this.environmentMapByAlias[a].startsWith(prefix) &&
                        (mCompact.includes(aCompact) || aCompact.includes(mCompact))) {
                        return this.environmentMapByAlias[a];
                    }
                }
            }
            return null;
        }
    };

    // =========================================================================
    // MORNING REPORT - Generador de resumen matutino (buenos días)
    // =========================================================================
    const MorningReport = {
        newsPool: [
            { cat: 'Política',       text: 'El Gobierno anunció un nuevo paquete de inversión en infraestructura vial para los próximos tres años, beneficiando a siete regiones del sur del país.' },
            { cat: 'Tecnología',     text: 'Google presentó su nuevo modelo de inteligencia artificial multimodal que promete revolucionar la edición de video y la generación de imágenes realistas en tiempo real.' },
            { cat: 'Deportes',       text: 'La selección peruana venció 2-0 a su rival en el partido amistoso celebrado en el estadio nacional, con goles espectaculares en los minutos 32 y 78.' },
            { cat: 'Cultura',        text: 'El Museo de Arte de Lima inauguró una exposición histórica de 200 obras precolombinas que llegan por primera vez al país desde colecciones europeas.' },
            { cat: 'Economía',       text: 'El sol cerró la semana con una ligera apreciación frente al dólar, lo que los analistas atribuyen a la mayor entrada de divisas por el sector turístico.' },
            { cat: 'Ciencia',        text: 'Investigadores de la UNSAAC descubrieron una nueva especie de orquídea endémica en los bosques nublados del Valle Sagrado, cerca de Cusco.' },
            { cat: 'Internacional',  text: 'La ONU declaró oficialmente el Día Internacional del Café, reconociendo la labor de millones de pequeños productores en todo el mundo.' },
            { cat: 'Turismo',        text: 'Machu Picchu superó el récord de visitantes mensuales, con más de 180 mil turistas en agosto, gracias a la temporada alta y nuevas rutas de acceso.' }
        ],

        pickNews(n) {
            const shuffled = [...this.newsPool].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, n);
        },

        getCuscoTemp() {
            return +(8 + Math.random() * 14).toFixed(1);
        },

        getRainChance() {
            return Math.floor(Math.random() * 101);
        },

        getHumidity() {
            return 40 + Math.floor(Math.random() * 51);
        },

        feelsLike(temp) {
            const delta = (Math.random() * 4 - 2);
            return +(temp + delta).toFixed(1);
        },

        weekdayName(d) {
            return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getDay()];
        },

        monthName(d) {
            return ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'][d.getMonth()];
        },

        greetingByHour() {
            const h = new Date().getHours();
            if (h < 12)  return ['¡Muy buenos días!','¡Buen día!','¡Buenos días y bienvenido!'];
            if (h < 20)  return ['¡Buenas tardes!','¡Excelente tarde!','¡Muy buenas tardes para ti!'];
            return ['¡Buenas noches!','¡Muy buenas noches!','¡Feliz noche!'];
        },

        rainLevelText(p) {
            if (p <= 15) return 'muy baja, casi improbable que llueva hoy';
            if (p <= 35) return 'baja, con chispas ocasionales no esperadas';
            if (p <= 60) return 'moderada, podrías llevar un paraguas por si acaso';
            if (p <= 80) return 'alta, lo más seguro es que llueva en algún momento del día';
            return 'muy alta, prepárate para un día lluvioso y toma tus precauciones';
        },

        rainAdvice(p) {
            if (p <= 15) return 'No necesitas paraguas hoy. Disfruta del cielo despejado y sal sin preocupaciones.';
            if (p <= 35) return 'Te recomiendo llevar un paraguas pequeño en la mochila, por si acaso cae alguna chispa inesperada.';
            if (p <= 60) return 'Mejor lleva paraguas y calzado que no se moje, ya que la probabilidad de lluvia es moderada.';
            if (p <= 80) return 'No olvides tu paraguas, impermeable y cuida tus pasos al caminar porque lo más probable es que llueva.';
            return 'Saca el paraguas grande, usa ropa abrigada y evita salir si no es necesario, la lluvia será intensa hoy.';
        },

        tempAdvice(t) {
            if (t < 11) return 'Hace bastante frío en Cusco, así que no olvides tu bufanda, guantes y un buen abrigo grueso antes de salir.';
            if (t < 15) return 'El clima está fresco, así que te sugiero usar una chaqueta ligera y varias capas para ir cómodo.';
            if (t < 19) return 'La temperatura es muy agradable, ropa ligera pero con un suéter por si baja un poco más la temperatura.';
            return 'Hace un día cálido y soleado, usa protector solar, lleva agua para hidratarte y lentes oscuros.';
        },

        motivationalClosing() {
            const phrases = [
                'Hoy es un día maravilloso para lograr cosas increíbles. ¡Vamos con toda la actitud positiva!',
                'Recuerda que cada gran día comienza con una pequeña sonrisa. ¡A por todas tus metas de hoy!',
                'Deseo que tengas un día productivo, lleno de sorpresas agradables y mucha alegría junto a tus seres queridos.',
                'Que tu día esté lleno de energía, buenas noticias y éxitos en todo lo que te propongas hacer.',
                'Hoy tienes la oportunidad de hacer de este día el mejor de tu semana. ¡Ve y haz que cada momento cuente!'
            ];
            return phrases[Math.floor(Math.random() * phrases.length)];
        },

        buildReport() {
            const now = new Date();
            const greetings = this.greetingByHour();
            const greet = greetings[Math.floor(Math.random() * greetings.length)];
            const weekday = this.weekdayName(now);
            const day = now.getDate();
            const month = this.monthName(now);
            const year = now.getFullYear();

            const temp = this.getCuscoTemp();
            const feels = this.feelsLike(temp);
            const rain = this.getRainChance();
            const humidity = this.getHumidity();
            const news = this.pickNews(4);

            const parts = [];
            parts.push(`${greet} Qué alegría saludarte en este maravilloso ${weekday} ${day} de ${month} del ${year}.`);
            parts.push(`Espero que hayas descansado de maravilla y que estés lleno de energía para enfrentar esta nueva jornada.`);
            parts.push(`Sin más preámbulos, aquí tienes tu resumen personalizado del día de hoy, preparado con mucho cariño para ti.`);

            parts.push('');
            parts.push('📰 EMPECEMOS CON LAS NOTICIAS MÁS IMPORTANTES DE HOY:');
            parts.push('');
            parts.push(`Primera noticia, en el ámbito de ${news[0].cat.toLowerCase()}: ${news[0].text}`);
            parts.push(`Pasando ahora al área de ${news[1].cat.toLowerCase()}, te cuento lo siguiente: ${news[1].text}`);
            parts.push(`En tercer lugar, en ${news[2].cat.toLowerCase()}: ${news[2].text}`);
            parts.push(`Y para cerrar la sección de noticias, desde ${news[3].cat.toLowerCase()}: ${news[3].text}`);
            parts.push('Estas son noticias seleccionadas cuidadosamente para que estés informado de los hechos más relevantes del día.');

            parts.push('');
            parts.push('🌡️ AHORA EL INFORME METEOROLÓGICO PARA LA HERMOSA CIUDAD DEL CUSCO:');
            parts.push('');
            parts.push(`En este momento, en Cusco la temperatura es de ${temp} grados Celsius, aunque la sensación térmica es de ${feels} grados.`);
            parts.push(`La humedad relativa ronda el ${humidity} por ciento.`);
            parts.push(this.tempAdvice(temp));
            parts.push(`Con respecto a la lluvia, la probabilidad actual es del ${rain} por ciento, lo que significa una probabilidad ${this.rainLevelText(rain)}.`);
            parts.push(this.rainAdvice(rain));

            parts.push('');
            parts.push('💡 UN ÚLTIMO CONSEJO ANTES DE IRME:');
            parts.push('Si vas a salir a caminar por el centro histórico o visitar algún sitio turístico, no olvides llevar agua, protector solar y tu documento de identidad.');
            parts.push('Y recuerda: a la altitud de Cusco el cuerpo se cansa más rápido, así que camina despacio e hidrátate constantemente.');

            parts.push('');
            parts.push(this.motivationalClosing());
            parts.push('Estoy aquí para ayudarte en lo que necesites durante todo el día. ¿Qué quieres hacer ahora? ¿Encender alguna luz? ¿Apagar el WiFi? ¡Solo tienes que decírmelo!');

            return parts.join('\n');
        }
    };

    // =========================================================================
    // COMMAND PARSER - Interpreta comandos de voz normalizados
    // =========================================================================
    const CommandParser = {
        normalize(text) {
            return text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[¿?¡!.,;:"'\-_]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        matchFloor(text) {
            const map = {
                '1': 'floor1', 'uno': 'floor1', 'primero': 'floor1', 'primer': 'floor1',
                '2': 'floor2', 'dos': 'floor2', 'segundo': 'floor2',
                '3': 'floor3', 'tres': 'floor3', 'tercero': 'floor3', 'tercer': 'floor3',
                '4': 'floor4', 'cuatro': 'floor4', 'cuarto': 'floor4',
                '5': 'floor5', 'cinco': 'floor5', 'quinto': 'floor5'
            };
            const re = /(?:luz|luces|luz de|piso)\s+(?:del|de|el|los)?\s*(1|2|3|4|5|uno|dos|tres|cuatro|cinco|primero|segundo|tercero|cuarto|quinto|primer|tercer)/;
            const re2 = /(1|2|3|4|5|uno|dos|tres|cuatro|cinco|primero|segundo|tercero|cuarto|quinto|primer|tercer)\s*(?:piso|piso de)/;
            let m = text.match(re) || text.match(re2);
            if (!m) {
                const re3 = /piso\s*(\d|[a-z]+)/;
                m = text.match(re3);
            }
            if (m) {
                const k = Object.keys(map).find(k => m[1].includes(k));
                return k ? map[k] : null;
            }
            return null;
        },

        matchFloorNumber(text) {
            const words = {
                'uno': 1, 'primero': 1, 'primer': 1, '1': 1,
                'dos': 2, 'segundo': 2, '2': 2,
                'tres': 3, 'tercero': 3, 'tercer': 3, '3': 3,
                'cuatro': 4, 'cuarto': 4, '4': 4,
                'cinco': 5, 'quinto': 5, '5': 5,
                'planta baja': 1, 'baja': 1,
                'penthouse': 5, 'atico': 5
            };
            for (const w of Object.keys(words)) {
                if (text.includes(w)) return words[w];
            }
            return null;
        },

        matchExtraDevice(text) {
            const map = [
                { keys: ['ventilador', 'ventilacion', 'ventilar'], key: 'ventilador' },
                { keys: ['tele', 'television', 'tv', 'televisor'], key: 'tv' },
                { keys: ['aire', 'ac', 'aire acondicionado', 'acondicionado', 'aire frio'], key: 'ac' },
                { keys: ['cafetera', 'cafe', 'maquina de cafe'], key: 'cafetera' }
            ];
            for (const m of map) {
                if (m.keys.some(k => text.includes(k))) return m.key;
            }
            return null;
        },

        detectAction(text) {
            if (/\b(encender|prender|activar|poner|abrir|iniciar|conectar)\b/.test(text)) return 'on';
            if (/\b(apagar|desconectar|desactivar|cerrar|detener|quitar)\b/.test(text)) return 'off';
            if (/\b(alternar|cambiar|toogle|toggle)\b/.test(text)) return 'toggle';
            return null;
        },

        respondDeviceChange(name, nowOn, res) {
            const extra = (nowOn
                ? [
                    `¡Listo! He encendido ${name} sin ningún problema. Ya puedes disfrutar de él mientras tanto.`,
                    `Perfecto, ${name} ha sido activado correctamente. Todo está funcionando como debería.`,
                    `¡Excelente elección! He encendido ${name} de inmediato. Avísame si quieres cambiarlo de nuevo.`
                  ]
                : [
                    `¡Listo! He apagado ${name} para ahorrar energía. No te preocupes, lo vuelvo a encender cuando quieras.`,
                    `Perfecto, ${name} ha sido desactivado con éxito. Así cuidamos un poco más el consumo del hogar.`,
                    `He apagado ${name} tal como pediste. Cuando lo necesites de vuelta, solo dímelo.`
                  ]);
            if (!res.changed) {
                return `${name} ya estaba ${nowOn ? 'encendido' : 'apagado'}, así que no hizo falta hacer cambios. Pero avísame si quieres algo más.`;
            }
            return extra[Math.floor(Math.random() * extra.length)];
        },

        respondBulk(names, on, kind) {
            const joined = names.map(n => DeviceManager.getName(n)).join(', ');
            const verb = on ? 'encendido' : 'apagado';
            return [
                `¡Perfecto! He ${verb} ${kind} al mismo tiempo: ${joined}. Todo listo en un solo comando, qué práctico verdad.`,
                `Listo, ${kind} han sido ${verb} de inmediato: ${joined}. Ahora ${on ? 'brilla todo con mucha luz' : 'se ha ahorrado bastante energía'}.`,
                `Excelente solicitud. He ${verb} ${joined} al unísono. Tu hogar ahora está ${on ? 'totalmente iluminado y listo' : 'en modo ahorro de energía'}.`
            ][Math.floor(Math.random() * 3)];
        },

        parse(rawText) {
            const text = this.normalize(rawText);

            // Buenos días
            if (/\b(buenos dias|buen dia|hola buenos|muy buenos)\b/.test(text) && !/\bapagar|encender/.test(text)) {
                return { intent: 'morning', response: MorningReport.buildReport() };
            }

            // Ayuda / qué puedes hacer
            if (/\b(ayuda|opciones|que puedes hacer|que sabes hacer|funciones|comandos|que haces)\b/.test(text)) {
                return { intent: 'help', response: this.buildHelp() };
            }

            // Hora
            if (/\b(que hora es|dime la hora|hora actual|tienes la hora|hora por favor)\b/.test(text)) {
                return { intent: 'time', response: this.buildTime() };
            }

            // Saludo casual
            if (/^(hola|buenas|hey|que tal|como estas|que pasa)\s*$/.test(text) ||
                /\b(hola que tal|hola como estas)\b/.test(text)) {
                return { intent: 'hello', response: this.buildHello() };
            }

            // Estado / cómo estás
            if (/\b(como estas|que tal estas|como te encuentras|como andas)\b/.test(text)) {
                return { intent: 'howareu', response: this.buildHowAreYou() };
            }

            // Gracias
            if (/\b(gracias|muchas gracias|te agradezco|mil gracias)\b/.test(text)) {
                return { intent: 'thanks', response: this.buildThanks() };
            }

            // Acción
            const action = this.detectAction(text);

            // Todas las luces (piso + patio)
            if (action && /\b(todas las luces|toda la luz|las luces|las lamparas|toda la casa|toda la vivienda|iluminacion)\b/.test(text)
                && !/\b(electrodomesticos|aparatos|extra|adicionales|dispositivos)\b/.test(text)) {
                const on = (action === 'on');
                const names = on ? DeviceManager.turnOnAllLights() : DeviceManager.turnOffAllLights();
                return { intent: 'bulk_lights', response: this.respondBulk(names, on, 'todas las luces de la casa, desde el piso 1 hasta el patio') };
            }

            // Todos los electrodomésticos
            if (action && /\b(todos los electrodomesticos|todos los aparatos|todos los dispositivos|las cosas|lo demas|los extras)\b/.test(text)) {
                const on = (action === 'on');
                const names = on ? DeviceManager.turnOnAllExtra() : DeviceManager.turnOffAllExtra();
                return { intent: 'bulk_extra', response: this.respondBulk(names, on, 'todos los electrodomésticos adicionales') };
            }

            // Ambiente individual (cocina, cochera, gimnasio, etc.)
            const floorCtx = this.matchFloorNumber(text);
            const envKey = DeviceManager.resolveEnvironmentAlias(text, floorCtx);
            if (action && envKey) {
                const meta = DeviceManager.deviceMeta[envKey] || { name: envKey };
                let on;
                let res;
                if (action === 'toggle') {
                    res = DeviceManager.toggleDevice(envKey);
                } else {
                    on = (action === 'on');
                    res = DeviceManager.setDevice(envKey, on);
                }
                const verb = res.nowOn ? 'encender' : 'apagar';
                const extraResponses = res.nowOn
                    ? [
                        `¡Listo! He ${verb} ${meta.name} sin problemas. Ya puedes disfrutar de ese ambiente iluminado. Avísame si necesitas algo más.`,
                        `Perfecto, ${meta.name} se ha activado correctamente. Todo está funcionando como debería en ese lugar.`,
                        `¡Excelente! He encendido ${meta.name} de inmediato. Si quieres encender más ambientes, solo dímelo.`
                      ]
                    : [
                        `¡Hecho! He apagado ${meta.name} para ahorrar energía. Lo vuelvo a encender cuando quieras, sin problema.`,
                        `Perfecto, ${meta.name} está desactivado con éxito. Así cuidamos un poco más el consumo del hogar.`,
                        `Listo, ${meta.name} se ha apagado tal como pediste. Cuando lo necesites de vuelta, solo avísame.`
                      ];
                const base = extraResponses[Math.floor(Math.random() * extraResponses.length)];
                const unchanged = res.changed === false
                    ? ` (Nota: ${meta.name} ya estaba ${res.nowOn ? 'encendido' : 'apagado'} de antemano)`
                    : '';
                return { intent: 'environment', response: base + unchanged };
            }

            // Piso específico
            const floor = this.matchFloor(text);
            if (action && floor) {
                let on;
                if (action === 'toggle') {
                    const res = DeviceManager.toggleDevice(floor);
                    return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName(floor), res.nowOn, res) };
                }
                on = (action === 'on');
                const res = DeviceManager.setDevice(floor, on);
                return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName(floor), on, res) };
            }

            // Patio
            if (action && /\b(patio|jardin|terraza|exterior|patio de atras|patio interno)\b/.test(text)) {
                let on;
                if (action === 'toggle') {
                    const res = DeviceManager.toggleDevice('patio');
                    return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName('patio'), res.nowOn, res) };
                }
                on = (action === 'on');
                const res = DeviceManager.setDevice('patio', on);
                return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName('patio'), on, res) };
            }

            // WiFi
            if (action && /\b(wifi|wi fi|internet|red|wifi de|la red|conexion inalambrica)\b/.test(text)) {
                let on;
                if (action === 'toggle') {
                    const res = DeviceManager.toggleDevice('wifi');
                    return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName('wifi'), res.nowOn, res) };
                }
                on = (action === 'on');
                const res = DeviceManager.setDevice('wifi', on);
                const extra = on
                    ? ' Ahora puedes conectar todos tus dispositivos a la red sin problemas.'
                    : ' Recuerda que si necesitas navegar otra vez, solo pídemelo de nuevo con gusto.';
                return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName('wifi'), on, res) + extra };
            }

            // Dispositivos extra
            const extraDev = this.matchExtraDevice(text);
            if (action && extraDev) {
                let on;
                if (action === 'toggle') {
                    const res = DeviceManager.toggleDevice(extraDev);
                    return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName(extraDev), res.nowOn, res) };
                }
                on = (action === 'on');
                const res = DeviceManager.setDevice(extraDev, on);
                let add = '';
                if (res.changed) {
                    if (extraDev === 'cafetera' && on) add = ' ¡En unos minutos tendrás un café delicioso esperándote, a disfrutar!';
                    if (extraDev === 'cafetera' && !on) add = ' Tu cafetera está segura y apagada. ¡Hasta la próxima taza!';
                    if (extraDev === 'tv' && on) add = ' A buscar tu serie o película favorita, ¡buen maratón te espera!';
                    if (extraDev === 'ac' && on) add = ' En breve sentirás el agradable aire fresco recorriendo toda la habitación.';
                    if (extraDev === 'ventilador' && on) add = ' Prepárate para sentir una brisa refrescante en todo momento.';
                }
                return { intent: 'device', response: this.respondDeviceChange(DeviceManager.getName(extraDev), on, res) + add };
            }

            // Acción sin dispositivo claro
            if (action) {
                return {
                    intent: 'unclear',
                    response: [
                        'Entiendo que quieres encender o apagar algo, pero no terminé de identificar exactamente qué. Intenta decirme por ejemplo: "encender cocina", "apagar gimnasio del penthouse", "encender todo el piso 2", "apagar WiFi" o "encender cafetera". ¡Para allá voy contigo!',
                        'Lo siento un poco, no logré entender cuál ambiente o dispositivo quieres controlar. Te recuerdo que tengo 30 ambientes en 5 pisos: cochera, cocina, habitaciones, sala de juegos, gimnasio, bar, etc. ¡Además del patio, WiFi, ventilador, tele, aire y cafetera! Inténtalo de nuevo con más detalles.',
                        'Hmm, creo que no escuché bien qué quieres activar o desactivar. ¿Podrías repetirlo diciéndome el nombre del ambiente? Por ejemplo: "prender cochera", "apagar sala principal", "encender habitación 3 del piso 4" o "apagar televisor". ¡Gracias por tu paciencia!'
                    ][Math.floor(Math.random() * 3)]
                };
            }

            // Sin match: respuesta general
            return {
                intent: 'unknown',
                response: this.buildUnknown(rawText)
            };
        },

        buildHelp() {
            return [
                '¡Con gusto te explico todas las cosas maravillosas que puedo hacer por ti hoy! Soy Keyla, tu asistente domótico súper completo. ¡Prepara tu oreja que te cuento todo con muchísimo detalle!',
                '',
                '🏠 CONTROL DE AMBIENTES INDIVIDUALES POR PISO (LO MÁS NUEVO):',
                'Cada piso del 1 al 5 tiene sus propios ambientes y yo los controlo a todos de forma independiente. ¡Aquí tienes la lista completa para que lo tengas súper claro!',
                '',
                '  🏡 PISO 1 · PLANTA BAJA: Cochera, Baños Sociales, Hall de Entrada, Comedor Diario, Lavandería/Depósito, Pasillos.',
                '  🏡 PISO 2 · SOCIAL: Cocina, Sala Principal, Comedor Principal, Habitación 1, Habitación 2, Baño.',
                '  🏢 PISO 3 · HABITACIONAL: Habitación Principal, Baño Principal, Vestidor, Sala de Estar, Balcón, Pasillos.',
                '  🏬 PISO 4 · FAMILIAR: Habitación 3, Habitación 4, Baño Compartido, Sala de Juegos, Estudio/Biblioteca, Terraza.',
                '  🏙️ PISO 5 · PENTHOUSE: Gimnasio, Salón de Reuniones, Bar, Baño Visitas, Terraza Panorámica, Cuarto de Servicio.',
                '',
                'Ejemplos de comandos por ambiente que puedes decirme:',
                '  • "Encender la cocina" (enciende la cocina del piso 2 por defecto)',
                '  • "Apagar cochera" (planta baja)',
                '  • "Prender gimnasio del penthouse"',
                '  • "Activar la habitación principal del tercer piso"',
                '  • "Desactivar la sala de juegos"',
                '  • "Encender la sala principal del piso 2"',
                '  • "Apagar el balcón"',
                '',
                '🔆 CONTROL GENERAL POR PISO COMPLETO:',
                'También puedes encender o apagar TODO un piso de un solo comando (todos sus 6 ambientes a la vez). Ejemplos:',
                '  • "Encender todo el piso 2"',
                '  • "Apagar piso 3 completamente"',
                '  • "Prender la luz del quinto piso"',
                '',
                '💡 CONTROL MASIVO DE TODAS LAS LUCES:',
                'Si quieres encender o apagar absolutamente todas las luces de la casa (pisos 1-5 + patio + todos los ambientes), solo dime:',
                '  • "Encender todas las luces"',
                '  • "Apagar toda la iluminación de la casa"',
                '',
                '🌳 PATIO Y EXTERIORES:',
                'Controlo las luces del patio, jardín o terraza externa. Ej: "encender luces del patio" o "apagar jardín".',
                '',
                '📶 CONTROL DEL WIFI:',
                'Conecto o desconecto el WiFi de tu hogar cuando quieras. Prueba diciendo "encender WiFi" o "apagar la red". ¡Así de simple!',
                '',
                '🔌 ELECTRODOMÉSTICOS ADICIONALES:',
                'Además, manejo 4 dispositivos muy útiles: ventilador, televisión, aire acondicionado y cafetera. Ejemplos:',
                '  • "Encender el ventilador"',
                '  • "Apagar la tele"',
                '  • "Prender aire acondicionado"',
                '  • "Encender la cafetera" (¡mi función favorita, adelante con ese café delicioso!)',
                'Y si quieres encender o apagar todos los electrodomésticos a la vez: "apagar todos los electrodomésticos".',
                '',
                '🌞 RESUMEN MATUTINO "BUENOS DÍAS":',
                '¡Mi función estrella! Cuando me digas BUENOS DÍAS, te daré un mega informe completísimo con:',
                '  ✅ Saludo personalizado con día y fecha.',
                '  ✅ 4 noticias importantes de hoy en distintas categorías.',
                '  ✅ Temperatura actual en Cusco, sensación térmica y humedad.',
                '  ✅ Probabilidad de lluvia y consejos personalizados.',
                '  ✅ Recomendaciones prácticas y frase motivadora.',
                '¡No te olvides de probarlo cada mañana, te encantará!',
                '',
                '⏰ OTRAS FUNCIONES EXTRA:',
                '• Pregúntame "qué hora es" y te respondo la hora actual con cariño.',
                '• Salúname, agradéceme o pregúntame cómo estoy: ¡soy súper conversacional y charlatana!',
                '',
                'Y esto no es todo: también puedes hacer clic directamente en las tarjetas de la pantalla si no quieres hablar, funciona igual de bien. Estoy aquí para hacerte la vida más fácil y bonita. ¿Qué probamos primero?'
            ].join('\n');
        },

        buildTime() {
            const now = new Date();
            let h = now.getHours();
            const m = now.getMinutes();
            const ampm = h >= 12 ? 'de la tarde' : 'de la mañana';
            let h12 = h % 12;
            h12 = h12 === 0 ? 12 : h12;
            const mm = (m < 10 ? '0' + m : m);
            const extras = [
                `Tienes todo el día por delante para cumplir tus sueños. ¡Aprovecha cada minuto!`,
                `Espero que estés disfrutando mucho de este ${MorningReport.weekdayName(now)}. ¡Sigue así!`,
                `El tiempo vuela cuando se disfruta, así que disfruta cada segundo al máximo.`
            ];
            return [
                `¡Claro que sí! Mirando el reloj ahora mismo, te puedo decir que son las ${h12} y ${mm} minutos ${ampm}.`,
                `En formato de 24 horas serían las ${h} con ${mm} minutos, por si te sirve mejor esa referencia.`,
                extras[Math.floor(Math.random() * extras.length)]
            ].join(' ');
        },

        buildHello() {
            const h = new Date().getHours();
            const greet = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
            return [
                `¡Hola hola! ${greet}! ¿Cómo está siendo tu día hoy? Espero que estés disfrutando muchísimo y que todo salga a la perfección.`,
                `¡Hola, un placer saludarte! ${greet} para ti. ¿En qué puedo ayudarte esta hermosa jornada? Tengo luces, WiFi, noticias, clima y hasta cafetera lista para ti.`,
                `¡Hey! ¡Qué bueno que estés aquí! ${greet}, ¿cómo va todo? Avísame lo que necesites que yo estoy a tu disposición con mucho gusto.`
            ][Math.floor(Math.random() * 3)];
        },

        buildHowAreYou() {
            return [
                '¡Gracias por preguntarme! Me encuentro de maravilla, con la batería llena y súper entusiasmada de ayudarte en todo lo que necesites hoy. Me hace muy feliz tener esta charla contigo. ¿Y tú cómo estás tú?',
                '¡Estoy de lujo, de verdad! Siento que es un día espectacular para hacer cosas grandiosas. Mi sistema está funcionando de maravilla, el reconocimiento de voz está a tope, todo perfecto. ¿Cómo va tu día?',
                '¡Muy, muy bien, gracias! Cada vez que me hablas me pongo de muy buen humor. Solo espero tus comandos para ejecutarlos al instante. ¿Qué tal estás tú el día de hoy?'
            ][Math.floor(Math.random() * 3)];
        },

        buildThanks() {
            return [
                '¡No tienes de qué! Para mí es un placer enorme servirte. Cuenta conmigo siempre que necesites cualquier cosa, estaré aquí esperando tus comandos con mucho gusto. ¡Hasta la próxima solicitud!',
                '¡De nada, con todo el cariño! Me alegra mucho haberte ayudado hoy. Recuerda que a cualquier hora, solo presiona el micrófono y hablame, ahí estaré yo. ¡Mil gracias a ti por tu preferencia!',
                '¡Un placer total ayudarte, de verdad! Gracias a ti por darme la oportunidad de hacer tu día más sencillo. ¿Hay algo más que pueda hacer por ti? ¡No dudes ni un segundo en pedírmelo!'
            ][Math.floor(Math.random() * 3)];
        },

        buildUnknown(raw) {
            return [
                `Mmm, no estoy del todo seguro de haber entendido lo que quisiste decir con "${raw}". Lo siento un poco por eso. ¡Pero no te preocupes! Puedes decirme "ayuda" y te enumero todo lo que sé hacer: ambientes por piso, cocina, cochera, gimnasio y muchísimo más.`,
                `¡Ay! Creo que el micrófono pudo captar algo diferente a lo que querías decirme. Escuché algo como "${raw}", pero no lo pude relacionar con ninguno de mis comandos. Prueba a decirme "ayuda" para ver la lista completa (incluye 30 ambientes en 5 pisos), ¡y lo intentamos de nuevo!`,
                `No estoy seguro de interpretar "${raw}" como un comando que conozca todavía. Pero oye, no pasa nada, aquí tienes ideas: "encender cocina", "apagar gimnasio del penthouse", "encender todo el piso 3", activar el WiFi, decir "buenos días" para tu resumen matutino o preguntarme la hora. ¡Prueba algo de eso y encantada te ayudaré!`
            ][Math.floor(Math.random() * 3)];
        }
    };

    // =========================================================================
    // CONVERSATION HISTORY - Historial visual
    // =========================================================================
    const ConversationHistory = {
        el: null,

        init() {
            this.el = document.getElementById('chatHistory');
        },

        add(sender, message) {
            if (!this.el) return;
            const wrap = document.createElement('div');
            wrap.className = 'chat-message ' + (sender === 'usuario' || sender === 'user' ? 'user-msg' : 'assistant-msg');

            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble';

            const snd = document.createElement('span');
            snd.className = 'msg-sender';
            snd.textContent = sender === 'user' || sender === 'usuario' ? 'Tú' : (sender === 'system' ? 'Sistema' : 'Keyla');

            const p = document.createElement('p');
            p.textContent = message;

            bubble.appendChild(snd);
            bubble.appendChild(p);
            wrap.appendChild(bubble);
            this.el.appendChild(wrap);
            this.el.scrollTop = this.el.scrollHeight;
        }
    };

    // =========================================================================
    // UI CONTROLLER - Orquesta toda la aplicación
    // =========================================================================
    const App = {
        micBtn: null,
        micIcon: null,
        transcriptionEl: null,
        statusEl: null,
        statusText: null,
        voiceHint: null,

        init() {
            this.micBtn = document.getElementById('micBtn');
            this.micIcon = document.getElementById('micIcon');
            this.transcriptionEl = document.getElementById('transcription');
            this.statusEl = document.getElementById('statusIndicator');
            this.statusText = document.getElementById('statusText');
            this.voiceHint = document.getElementById('voiceHint');

            DeviceManager.initUI();
            VoiceSynthesizer.init();
            ConversationHistory.init();

            const ok = VoiceRecognizer.init(
                (text, isFinal) => this.onSpeechResult(text, isFinal),
                (err) => this.onSpeechError(err),
                () => this.onListenStart(),
                () => this.onListenEnd()
            );

            if (!ok && this.transcriptionEl) {
                this.transcriptionEl.textContent = '⚠ Navegador no compatible. Usa Chrome o Edge.';
                this.transcriptionEl.style.color = '#e63946';
            }

            if (this.micBtn) {
                this.micBtn.addEventListener('click', () => {
                    VoiceRecognizer.toggle();
                });
            }

            // Mensaje de bienvenida
            setTimeout(() => {
                const greet = new Date().getHours() < 12 ? 'Buenos días' : (new Date().getHours() < 20 ? 'Buenas tardes' : 'Buenas noches');
                const welcome = `¡${greet}! Hola soy Keyla estoy lista para asistirte. Soy tu asistente domótico súper completo. Estoy lista para controlar todas las luces de tus 5 pisos, el patio, el WiFi, ventilador, televisor, aire acondicionado y hasta la cafetera. Si me dices "Buenos días" te cuento las noticias recientes, la temperatura en la ciudad del Cusco, las posibilidades de lluvia y muchísimo más. Y si tienes dudas solo dí "ayuda" y te lo explico todo con todo lujo de detalles. ¡Presiona el micrófono y hablemos!`;
                ConversationHistory.add('assistant', welcome);
                VoiceSynthesizer.speak(welcome);
            }, 800);
        },

        setListeningUI(listening) {
            if (this.micBtn) this.micBtn.classList.toggle('listening', listening);
            if (this.statusEl) this.statusEl.classList.toggle('listening', listening);
            if (this.statusText) this.statusText.textContent = listening ? 'Escuchando...' : 'Listo';
            if (this.micIcon) this.micIcon.textContent = listening ? '🔴' : '🎙️';
            if (this.voiceHint) {
                this.voiceHint.textContent = listening
                    ? '🎤 Te estoy escuchando... ¡Habla con claridad cerca del micrófono!'
                    : 'Haz clic en el micrófono y empieza a hablar';
                this.voiceHint.style.color = listening ? 'var(--danger)' : 'var(--text-secondary)';
            }
        },

        onListenStart() {
            this.setListeningUI(true);
        },

        onListenEnd() {
            this.setListeningUI(false);
        },

        onSpeechError(err) {
            this.setListeningUI(false);
            if (this.transcriptionEl) {
                this.transcriptionEl.textContent = '⚠ ' + err;
                this.transcriptionEl.style.color = '#e63946';
            }
            ConversationHistory.add('system', 'Error: ' + err);
            VoiceSynthesizer.speak('Lo siento, hubo un problema con el micrófono. ' + err);
        },

        onSpeechResult(text, isFinal) {
            if (this.transcriptionEl) {
                this.transcriptionEl.textContent = text;
                this.transcriptionEl.style.color = 'var(--secondary)';
            }
            if (isFinal) {
                ConversationHistory.add('user', text);
                const parsed = CommandParser.parse(text);
                ConversationHistory.add('assistant', parsed.response);
                VoiceSynthesizer.speak(parsed.response, null, () => {
                    if (this.transcriptionEl && !VoiceRecognizer.isListening) {
                        setTimeout(() => {
                            if (this.transcriptionEl) this.transcriptionEl.textContent = '';
                        }, 2500);
                    }
                });
            }
        }
    };

    // Iniciar la app cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }

    // Exponer globalmente para debugging
    window.__KeylaApp = { VoiceRecognizer, VoiceSynthesizer, DeviceManager, CommandParser, MorningReport, ConversationHistory };
})();
