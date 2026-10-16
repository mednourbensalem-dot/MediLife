/* MediLife data layer — the ONLY file that touches storage.
   Swap Store.load/save for fetch() calls to a secure backend later.
   PROTOTYPE: localStorage is NOT secure. Fictional data only. */
const Store = {
  key: 'medilife.v1',
  load() {
    try { const d = localStorage.getItem(this.key); if (d) return JSON.parse(d); } catch (e) {}
    return this.reset();
  },
  reset() { const d = seed(); try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {} return d; },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(DB)); return true; }
    catch (e) { return false; } // quota exceeded
  }
};

function seed() {
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const hrs = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
  return {
    users: [
      { id: 'a1', role: 'admin', name: 'Sana Ben Ali', email: 'admin@medilife.demo', pass: 'demo', active: true },
      { id: 'd1', role: 'doctor', name: 'Karim Trabelsi', spec: 'Cardiology', room: 'R-101', phone: '+216 70 000 001', email: 'doctor@medilife.demo', pass: 'demo', active: true, hours: { ...hrs } },
      { id: 'd2', role: 'doctor', name: 'Leila Mansour', spec: 'Dermatology', room: 'R-102', phone: '+216 70 000 002', email: 'leila@medilife.demo', pass: 'demo', active: true, hours: { ...hrs, start: '10:00', end: '16:00' } },
      { id: 'd3', role: 'doctor', name: 'Omar Jebali', spec: 'General Medicine', room: 'R-103', phone: '+216 70 000 003', email: 'omar@medilife.demo', pass: 'demo', active: true, hours: { ...hrs } },
      { id: 'p1', role: 'patient', name: 'Amine Khelifi', email: 'patient@medilife.demo', pass: 'demo', active: true, phone: '+216 20 111 222', emergency: 'Nour Khelifi — +216 20 333 444',
        allergies: ['Penicillin'], conditions: ['Hypertension'], access: ['d1', 'd3'] },
      { id: 'p2', role: 'patient', name: 'Salma Gharbi', email: 'salma@medilife.demo', pass: 'demo', active: true, phone: '+216 20 555 666', emergency: 'Hedi Gharbi — +216 20 777 888',
        allergies: [], conditions: ['Asthma'], access: ['d3'] }
    ],
    appts: [
      { id: 'ap1', pid: 'p1', did: 'd1', date: day(-30), time: '10:00', status: 'completed', reason: 'Blood pressure check', note: 'BP 150/95. Started amlodipine. Follow-up in 4 weeks.', dx: 'Hypertension stage 1' },
      { id: 'ap2', pid: 'p1', did: 'd1', date: day(3), time: '10:30', status: 'confirmed', reason: 'Follow-up', note: '', dx: '' },
      { id: 'ap3', pid: 'p2', did: 'd3', date: day(1), time: '09:30', status: 'pending', reason: 'Asthma review', note: '', dx: '' },
      { id: 'ap4', pid: 'p2', did: 'd3', date: day(-5), time: '11:00', status: 'missed', reason: 'Checkup', note: '', dx: '' }
    ],
    docs: [
      { id: 'dc1', pid: 'p1', title: 'Lipid panel results', cat: 'Laboratory', date: day(-31), by: 'd1', apptId: 'ap1', tags: 'blood', ver: 1 },
      { id: 'dc2', pid: 'p1', title: 'Amlodipine prescription', cat: 'Prescription', date: day(-30), by: 'd1', apptId: 'ap1', tags: '', ver: 1 }
    ],
    meds: [{ id: 'm1', pid: 'p1', name: 'Amlodipine', dose: '5 mg, once daily in the morning', start: day(-30), end: day(60), remind: true, by: 'd1' }],
    notifs: [{ id: 'n1', to: 'p1', text: 'Follow-up consultation confirmed.', date: day(0), read: false }],
    audit: [],
    clinic: { name: 'MediLife Clinic', hours: 'Mon–Fri 08:00–18:00', phone: '+216 70 000 000' }
  };
}
