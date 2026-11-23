/*
 * Motor de simulación de eventos discretos
 * Ruta M502 de MetroBus de Panamá (sentido Mañanitas)
 * Estación Marañón – Bahía 14  →  Calle Peña Blanca-R
 *
 * Reloj en segundos: t = 0 corresponde a las 5:00 a. m.
 * Llegadas de pasajeros y despachos: 0 <= t < 14 400 s (5:00–9:00 a. m.).
 * La corrida termina cuando todos los autobuses despachados salen de L6.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------
  // Datos del modelo (Tablas 10, 12 y 13 del documento)
  // ---------------------------------------------------------------------
  const STOPS = [
    { id: 'L1', name: 'Estación Marañón – Bahía 14', short: 'Marañón', role: 'Origen (despacho)', alightRate: 0, meanInterarrival: null, ratePerHour: 0 },
    { id: 'L2', name: 'El Dorado-R', short: 'El Dorado', role: 'Parada 1', alightRate: 0, meanInterarrival: 60, ratePerHour: 60 },
    { id: 'L3', name: 'Metro Villa Lucre-R', short: 'Villa Lucre', role: 'Parada 2', alightRate: 0.2, meanInterarrival: 75, ratePerHour: 48 },
    { id: 'L4', name: 'Cerro Viento-R', short: 'Cerro Viento', role: 'Parada 3', alightRate: 0.2, meanInterarrival: 100, ratePerHour: 36 },
    { id: 'L5', name: 'Las Trancas-R', short: 'Las Trancas', role: 'Parada 4', alightRate: 0.2, meanInterarrival: 150, ratePerHour: 24 },
    { id: 'L6', name: 'Calle Peña Blanca-R', short: 'Peña Blanca', role: 'Destino final', alightRate: 1, meanInterarrival: null, ratePerHour: 0 }
  ];

  // Tiempos de viaje triangulares en segundos: [mínimo, moda, máximo]
  const SEGMENTS = [
    { from: 0, to: 1, min: 720, mode: 960, max: 1260 },
    { from: 1, to: 2, min: 900, mode: 1200, max: 1560 },
    { from: 2, to: 3, min: 480, mode: 660, max: 720 },
    { from: 3, to: 4, min: 600, mode: 780, max: 1140 },
    { from: 4, to: 5, min: 420, mode: 540, max: 840 }
  ];

  const MODEL = {
    capacity: 80,          // pasajeros por autobús
    horizon: 14400,        // 4 h de llegadas y despachos
    startHour: 5,          // 5:00 a. m.
    dwellBase: 10,         // s fijos por parada
    boardSec: 5,           // s por pasajero que aborda
    alightSec: 3,          // s por pasajero que desciende
    replications: 5,
    baseSeed: 20261123,
    sampleEvery: 300       // muestreo de colas para gráficas (s)
  };

  const SCENARIOS = {
    inicial: { key: 'inicial', label: 'Inicial', name: 'Escenario inicial', headway: 1200, perHour: 3 },
    alternativo: { key: 'alternativo', label: 'Alternativo', name: 'Escenario alternativo', headway: 900, perHour: 4 }
  };

  // ---------------------------------------------------------------------
  // Generadores aleatorios reproducibles
  // ---------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed() {
    let h = 2166136261;
    for (let k = 0; k < arguments.length; k++) {
      const s = String(arguments[k]);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 0x9e3779b9; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function expSample(rng, mean) {
    let u; do { u = rng(); } while (u <= 0);
    return -mean * Math.log(u);
  }

  function triSample(rng, a, c, b) {
    const u = rng();
    const F = (c - a) / (b - a);
    return u < F ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }

  // Redondeo al entero más cercano; las mitades suben.
  function roundHalfUp(x) { return Math.floor(x + 0.5 + 1e-9); }

  // ---------------------------------------------------------------------
  // Lista de eventos futuros (montículo binario)
  // ---------------------------------------------------------------------
  class EventQueue {
    constructor() { this.h = []; this.seq = 0; }
    get size() { return this.h.length; }
    peek() { return this.h[0]; }
    static less(a, b) { return a.t < b.t || (a.t === b.t && a.s < b.s); }
    push(t, type, data) {
      const h = this.h; h.push({ t, type, data, s: this.seq++ });
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (EventQueue.less(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break;
      }
    }
    pop() {
      const h = this.h; if (!h.length) return null;
      const top = h[0]; const last = h.pop();
      if (h.length) {
        h[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < h.length && EventQueue.less(h[l], h[m])) m = l;
          if (r < h.length && EventQueue.less(h[r], h[m])) m = r;
          if (m === i) break;
          [h[i], h[m]] = [h[m], h[i]]; i = m;
        }
      }
      return top;
    }
  }

  // ---------------------------------------------------------------------
  // Simulación de una réplica
  // ---------------------------------------------------------------------
  class Simulation {
    constructor(scenarioKey, replication, options) {
      this.cfg = Object.assign({}, MODEL, options || {});
      this.scenario = SCENARIOS[scenarioKey];
      if (!this.scenario) throw new Error('Escenario desconocido: ' + scenarioKey);
      this.replication = replication;
      this.headway = this.cfg.headway || this.scenario.headway;

      const n = STOPS.length;
      this.time = 0;
      this.finished = false;
      this.endTime = null;
      this.queues = Array.from({ length: n }, () => []);
      this.maxQueue = new Array(n).fill(0);
      this.generated = new Array(n).fill(0);
      this.boardedAt = new Array(n).fill(0);
      this.alightedAt = new Array(n).fill(0);
      this.generatedTotal = 0;
      this.boardedTotal = 0;
      this.alightedTotal = 0;
      this.waitSum = 0; this.waitCount = 0; this.waitMax = 0;
      this.waitByStop = Array.from({ length: n }, () => ({ sum: 0, count: 0 }));
      this.leftBehindEvents = 0;      // veces que alguien se quedó porque el bus iba lleno
      this.travelTimes = [];
      this.buses = [];
      this.lastBusArrival = new Array(n).fill(null);
      this.headwayObs = Array.from({ length: n }, () => []);
      this.samples = [];
      this.nextSample = 0;
      this.log = [];
      this.events = new EventQueue();

      // Flujos de demanda independientes por parada; misma semilla en ambos
      // escenarios para la misma réplica (números aleatorios comunes).
      this.demandRng = STOPS.map((s, i) => mulberry32(hashSeed(this.cfg.baseSeed, 'demanda', replication, i)));
      for (let i = 1; i <= 4; i++) {
        const t = expSample(this.demandRng[i], STOPS[i].meanInterarrival);
        if (t < this.cfg.horizon) this.events.push(t, 'PASAJERO', { stop: i });
      }

      // Despachos programados desde L1
      let b = 0;
      for (let t = 0; t < this.cfg.horizon; t += this.headway) this.events.push(t, 'DESPACHO', { bus: b++ });
      this.totalBuses = b;
      this.lastDispatch = (b - 1) * this.headway;
    }

    // --- control del reloj -------------------------------------------------
    step() {
      const e = this.events.pop();
      if (!e) { this._finish(); return false; }
      this._sampleUpTo(e.t);
      this.time = e.t;
      this['_on' + e.type](e.data);
      if (!this.events.size) this._finish();
      return true;
    }

    runUntil(t) {
      while (this.events.size && this.events.peek().t <= t) this.step();
      if (!this.events.size) { this._finish(); return; }
      if (isFinite(t)) { this._sampleUpTo(t); this.time = Math.max(this.time, t); }
    }

    runToEnd() { this.runUntil(Infinity); return this.results(); }

    _finish() {
      if (this.finished) return;
      this.finished = true;
      this.endTime = this.time;
      this._sampleUpTo(this.time);
      this._pushSample(this.time);
    }

    _pushSample(t) {
      this.samples.push({
        t,
        queues: [1, 2, 3, 4].map(i => this.queues[i].length),
        onboard: this.buses.reduce((s, b) => s + (b.state !== 'finalizado' ? b.occupancy : 0), 0),
        activeBuses: this.buses.filter(b => b.state !== 'finalizado').length,
        avgWaitMin: this.waitCount ? this.waitSum / this.waitCount / 60 : 0
      });
    }

    _sampleUpTo(t) {
      while (this.nextSample <= t) { this._pushSample(this.nextSample); this.nextSample += this.cfg.sampleEvery; }
    }

    _log(msg) {
      this.log.push({ t: this.time, msg });
      if (this.log.length > 60) this.log.shift();
    }

    // --- eventos -----------------------------------------------------------
    _onPASAJERO(d) {
      const stop = d.stop;
      const q = this.queues[stop];
      q.push({ id: this.generatedTotal++, t: this.time });
      this.generated[stop]++;
      if (q.length > this.maxQueue[stop]) this.maxQueue[stop] = q.length;
      const next = this.time + expSample(this.demandRng[stop], STOPS[stop].meanInterarrival);
      if (next < this.cfg.horizon) this.events.push(next, 'PASAJERO', { stop });
    }

    _onDESPACHO(d) {
      const bus = {
        id: d.bus, number: d.bus + 1,
        dispatchTime: this.time,
        occupancy: 0, peakOccupancy: 0, boardedTotal: 0,
        state: 'en_ruta', seg: 0, segStart: 0, segEnd: 0,
        stopIdx: 0, dwellStart: 0, dwellEnd: 0, lastA: 0, lastD: 0,
        arrivalL6: null, exitTime: null, exitOccupancy: null,
        rng: mulberry32(hashSeed(this.cfg.baseSeed, 'viaje', this.replication, d.bus))
      };
      this.buses.push(bus);
      this._log(`Despacho del bus ${bus.number} desde ${STOPS[0].short}`);
      this._departFrom(bus, 0);
    }

    _departFrom(bus, stopIdx) {
      const s = SEGMENTS[stopIdx];
      const dt = triSample(bus.rng, s.min, s.mode, s.max);
      bus.state = 'en_ruta';
      bus.seg = stopIdx;
      bus.segStart = this.time;
      bus.segEnd = this.time + dt;
      this.events.push(bus.segEnd, 'LLEGADA_BUS', { bus: bus.id, stop: stopIdx + 1 });
    }

    _onLLEGADA_BUS(d) {
      const bus = this.buses[d.bus];
      const stop = d.stop;
      const st = STOPS[stop];
      const c = this.cfg;

      if (this.lastBusArrival[stop] !== null) this.headwayObs[stop].push(this.time - this.lastBusArrival[stop]);
      this.lastBusArrival[stop] = this.time;

      // 1) Descenso
      const D = stop === 5 ? bus.occupancy : Math.min(bus.occupancy, roundHalfUp(st.alightRate * bus.occupancy));
      bus.occupancy -= D;
      this.alightedAt[stop] += D;
      this.alightedTotal += D;

      // 2) Abordaje: grupo fijo al inicio del abordaje
      let A = 0, dwell;
      if (stop === 5) {
        dwell = c.dwellBase + c.alightSec * D;
        bus.arrivalL6 = this.time;
        this.travelTimes.push(this.time - bus.dispatchTime);
      } else {
        const q = this.queues[stop];
        const seats = c.capacity - bus.occupancy;
        A = Math.min(q.length, seats);
        const group = q.splice(0, A);
        for (const p of group) {
          const w = this.time - p.t;
          this.waitSum += w; this.waitCount++;
          this.waitByStop[stop].sum += w; this.waitByStop[stop].count++;
          if (w > this.waitMax) this.waitMax = w;
        }
        bus.occupancy += A;
        bus.boardedTotal += A;
        this.boardedAt[stop] += A;
        this.boardedTotal += A;
        if (q.length > 0) {
          this.leftBehindEvents += q.length;
          this._log(`Bus ${bus.number} lleno en ${st.short}: ${q.length} pasajeros esperan el siguiente`);
        }
        dwell = c.dwellBase + c.boardSec * A + c.alightSec * D;
      }
      bus.peakOccupancy = Math.max(bus.peakOccupancy, bus.occupancy);
      bus.state = 'en_parada';
      bus.stopIdx = stop;
      bus.dwellStart = this.time;
      bus.dwellEnd = this.time + dwell;
      bus.lastA = A; bus.lastD = D;
      this.events.push(bus.dwellEnd, 'SALIDA_BUS', { bus: bus.id, stop });
    }

    _onSALIDA_BUS(d) {
      const bus = this.buses[d.bus];
      if (d.stop === 5) {
        bus.state = 'finalizado';
        bus.exitTime = this.time;
        bus.exitOccupancy = bus.occupancy;
        this._log(`Bus ${bus.number} termina el recorrido en ${STOPS[5].short}`);
      } else {
        this._departFrom(bus, d.stop);
      }
    }

    // --- indicadores (Tabla 15) ------------------------------------------
    results() {
      const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
      const left = [1, 2, 3, 4].reduce((s, i) => s + this.queues[i].length, 0);
      const onboard = this.buses.reduce((s, b) => s + (b.state !== 'finalizado' ? b.occupancy : 0), 0);
      const finishedBuses = this.buses.filter(b => b.state === 'finalizado');
      return {
        scenario: this.scenario.key,
        scenarioName: this.scenario.name,
        replication: this.replication,
        headwayMin: this.headway / 60,
        busesDispatched: this.buses.length,
        busesScheduled: this.totalBuses,
        finished: this.finished,
        endTime: this.endTime,
        generated: this.generatedTotal,
        generatedByStop: [1, 2, 3, 4].map(i => this.generated[i]),
        transported: this.boardedTotal,
        boardedByStop: [1, 2, 3, 4].map(i => this.boardedAt[i]),
        alighted: this.alightedTotal,
        alightedByStop: [1, 2, 3, 4, 5].map(i => this.alightedAt[i]),
        notBoarded: left,
        leftByStop: [1, 2, 3, 4].map(i => this.queues[i].length),
        leftBehindEvents: this.leftBehindEvents,
        avgWaitMin: this.waitCount ? this.waitSum / this.waitCount / 60 : null,
        maxWaitMin: this.waitCount ? this.waitMax / 60 : null,
        avgWaitByStopMin: [1, 2, 3, 4].map(i => (this.waitByStop[i].count ? this.waitByStop[i].sum / this.waitByStop[i].count / 60 : null)),
        maxQueue: [1, 2, 3, 4].map(i => this.maxQueue[i]),
        avgTravelMin: this.travelTimes.length ? mean(this.travelTimes) / 60 : null,
        minTravelMin: this.travelTimes.length ? Math.min.apply(null, this.travelTimes) / 60 : null,
        maxTravelMin: this.travelTimes.length ? Math.max.apply(null, this.travelTimes) / 60 : null,
        observedHeadwayMin: [1, 2, 3, 4, 5].map(i => { const m = mean(this.headwayObs[i]); return m === null ? null : m / 60; }),
        peakOccupancy: this.buses.reduce((m, b) => Math.max(m, b.peakOccupancy), 0),
        checks: {
          conservation: this.generatedTotal === this.boardedTotal + left,
          boardedEqualsAlighted: this.finished ? this.boardedTotal === this.alightedTotal : this.boardedTotal === this.alightedTotal + onboard,
          busesLeaveEmpty: finishedBuses.every(b => b.exitOccupancy === 0),
          allBusesFinished: this.finished && finishedBuses.length === this.totalBuses
        }
      };
    }
  }

  // ---------------------------------------------------------------------
  // Experimento: R réplicas por escenario y comparación (Tabla 16, 8.6)
  // ---------------------------------------------------------------------
  const COMPARISON_METRICS = [
    { key: 'headwayMin', label: 'Intervalo programado (min)', decimals: 0 },
    { key: 'avgWaitMin', label: 'Tiempo promedio de espera (min)', decimals: 2 },
    { key: 'transported', label: 'Pasajeros transportados', decimals: 1 },
    { key: 'notBoarded', label: 'Pasajeros no abordados al cierre', decimals: 1 },
    { key: 'maxQueue0', label: 'Cola máxima L2 El Dorado-R', decimals: 1 },
    { key: 'maxQueue1', label: 'Cola máxima L3 Metro Villa Lucre-R', decimals: 1 },
    { key: 'maxQueue2', label: 'Cola máxima L4 Cerro Viento-R', decimals: 1 },
    { key: 'maxQueue3', label: 'Cola máxima L5 Las Trancas-R', decimals: 1 },
    { key: 'avgTravelMin', label: 'Tiempo promedio de recorrido (min)', decimals: 2 }
  ];

  function metricValue(rec, key) {
    if (key.indexOf('maxQueue') === 0) return rec.maxQueue[Number(key.slice(8))];
    return rec[key];
  }

  function summarize(records) {
    const out = {};
    for (const m of COMPARISON_METRICS) {
      const vals = records.map(r => metricValue(r, m.key)).filter(v => v !== null && v !== undefined);
      out[m.key] = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    }
    out.generated = records.reduce((s, r) => s + r.generated, 0) / records.length;
    out.leftBehindEvents = records.reduce((s, r) => s + r.leftBehindEvents, 0) / records.length;
    return out;
  }

  function compare(initial, alternative) {
    if (initial === null || alternative === null) return { diff: null, pct: null };
    const diff = alternative - initial;
    return { diff, pct: initial === 0 ? null : (100 * diff) / initial };
  }

  function runExperiment(options) {
    const opts = Object.assign({}, MODEL, options || {});
    const records = [];
    for (const key of ['inicial', 'alternativo']) {
      for (let r = 1; r <= opts.replications; r++) {
        records.push(new Simulation(key, r, opts).runToEnd());
      }
    }
    const summary = {
      inicial: summarize(records.filter(r => r.scenario === 'inicial')),
      alternativo: summarize(records.filter(r => r.scenario === 'alternativo'))
    };
    const comparison = COMPARISON_METRICS.map(m => Object.assign(
      { key: m.key, label: m.label, decimals: m.decimals, initial: summary.inicial[m.key], alternative: summary.alternativo[m.key] },
      compare(summary.inicial[m.key], summary.alternativo[m.key])
    ));
    return { options: opts, records, summary, comparison };
  }

  function formatClock(t, startHour) {
    const total = Math.max(0, Math.floor(t)) + (startHour === undefined ? MODEL.startHour : startHour) * 3600;
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  const api = { STOPS, SEGMENTS, MODEL, SCENARIOS, COMPARISON_METRICS, Simulation, runExperiment, metricValue, formatClock, triSample, expSample, mulberry32, hashSeed, roundHalfUp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.M502 = api;
})(typeof window !== 'undefined' ? window : this);
