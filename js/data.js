/* MediLife data layer — the ONLY file that touches storage.
   Swap Store.load/save for fetch() calls to a secure backend later.
   PROTOTYPE: localStorage is NOT secure. Fictional data only. */
const Store = {
  key: 'medilife.v2',
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
  const pad = n => String(n).padStart(2, '0');
  const day = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  const days = [1, 2, 3, 4, 5];
  const hrs = (start = '09:00', end = '17:00', d = days) => ({ start, end, days: d });

  return {
    users: [
      { id: 'a1', role: 'admin', name: 'Sana Ben Ali', email: 'admin@medilife.demo', pass: 'demo', active: true, phone: '+216 70 000 000' },

      { id: 'd1', role: 'doctor', name: 'Karim Trabelsi', spec: 'Cardiology', room: 'R-101', phone: '+216 70 000 001', email: 'doctor@medilife.demo', pass: 'demo', active: true, hours: hrs('09:00', '17:00') },
      { id: 'd2', role: 'doctor', name: 'Leila Mansour', spec: 'Dermatology', room: 'R-102', phone: '+216 70 000 002', email: 'leila@medilife.demo', pass: 'demo', active: true, hours: hrs('10:00', '16:00') },
      { id: 'd3', role: 'doctor', name: 'Omar Jebali', spec: 'General Medicine', room: 'R-103', phone: '+216 70 000 003', email: 'omar@medilife.demo', pass: 'demo', active: true, hours: hrs('08:30', '16:30') },
      { id: 'd4', role: 'doctor', name: 'Ines Bouazizi', spec: 'Pediatrics', room: 'R-104', phone: '+216 70 000 004', email: 'ines@medilife.demo', pass: 'demo', active: true, hours: hrs('09:00', '15:00', [1, 3, 5]) },

      { id: 'p1', role: 'patient', name: 'Amine Khelifi', email: 'patient@medilife.demo', pass: 'demo', active: true,
        phone: '+216 20 111 222', emergency: 'Nour Khelifi — +216 20 333 444', dob: '1985-04-12', blood: 'O+',
        allergies: ['Penicillin'], conditions: ['Hypertension'], access: ['d1', 'd3'] },
      { id: 'p2', role: 'patient', name: 'Salma Gharbi', email: 'salma@medilife.demo', pass: 'demo', active: true,
        phone: '+216 20 555 666', emergency: 'Hedi Gharbi — +216 20 777 888', dob: '1994-09-30', blood: 'A+',
        allergies: [], conditions: ['Asthma'], access: ['d3'] },
      { id: 'p3', role: 'patient', name: 'Youssef Ben Amor', email: 'youssef@medilife.demo', pass: 'demo', active: true,
        phone: '+216 20 909 121', emergency: 'Ines Ben Amor — +216 20 909 131', dob: '1968-01-22', blood: 'B+',
        allergies: ['Sulfa drugs'], conditions: ['Psoriasis', 'Hypertension'], access: ['d2', 'd3'] },
      { id: 'p4', role: 'patient', name: 'Mariem Chaabane', email: 'mariem@medilife.demo', pass: 'demo', active: true,
        phone: '+216 20 313 414', emergency: 'Sami Chaabane — +216 20 313 415', dob: '1999-07-05', blood: 'AB+',
        allergies: [], conditions: ['Migraine'], access: ['d2'] },
      { id: 'p5', role: 'patient', name: 'Yasmine Ben Salah', email: 'yasmine@medilife.demo', pass: 'demo', active: true,
        phone: '+216 20 616 717', emergency: 'Rim Ben Salah — +216 20 616 718', dob: '2017-03-19', blood: 'O-',
        allergies: ['Peanuts'], conditions: [], access: ['d4'] },

      { id: 'p6', role: 'patient', name: 'Rania Saidi', email: 'rania@medilife.demo', pass: 'demo', active: false,
        phone: '+216 20 818 919', emergency: '', dob: '1990-11-02', blood: 'A-', allergies: [], conditions: [], access: [] }
    ],

    appts: [
      { id: 'ap1', pid: 'p1', did: 'd1', date: day(-30), time: '10:00', status: 'completed', reason: 'Blood pressure check', note: 'BP 150/95. Started amlodipine 5 mg. Salt reduction discussed. Follow-up in 4 weeks.', dx: 'Hypertension stage 1' },
      { id: 'ap2', pid: 'p1', did: 'd1', date: day(0), time: '14:30', status: 'confirmed', reason: 'Follow-up — blood pressure', note: '', dx: '' },
      { id: 'ap3', pid: 'p1', did: 'd1', date: day(9), time: '10:00', status: 'pending', reason: 'Lab results review', note: '', dx: '' },
      { id: 'ap4', pid: 'p1', did: 'd3', date: day(18), time: '09:30', status: 'confirmed', reason: 'General consultation', note: '', dx: '' },
      { id: 'ap5', pid: 'p1', did: 'd1', date: day(-60), time: '09:30', status: 'completed', reason: 'Annual checkup', note: 'Cardiovascular risk low. Bloods ordered.', dx: 'Routine examination' },

      { id: 'ap6', pid: 'p2', did: 'd3', date: day(0), time: '09:30', status: 'confirmed', reason: 'Asthma review', note: '', dx: '' },
      { id: 'ap7', pid: 'p2', did: 'd3', date: day(-7), time: '11:00', status: 'missed', reason: 'Routine checkup', note: '', dx: '' },
      { id: 'ap8', pid: 'p2', did: 'd3', date: day(6), time: '16:00', status: 'pending', reason: 'Repeat prescription', note: '', dx: '' },

      { id: 'ap9', pid: 'p3', did: 'd2', date: day(1), time: '10:00', status: 'confirmed', reason: 'Skin rash follow-up', note: '', dx: '' },
      { id: 'ap10', pid: 'p3', did: 'd2', date: day(-14), time: '10:30', status: 'completed', reason: 'Eczema consultation', note: 'Topical clobetasol for 2 weeks, emollient daily. Review in 2 weeks.', dx: 'Psoriasis flare' },
      { id: 'ap11', pid: 'p3', did: 'd3', date: day(-45), time: '08:30', status: 'completed', reason: 'Blood pressure follow-up', note: 'BP 138/86 on current treatment. Continue and recheck in 3 months.', dx: 'Hypertension, controlled' },

      { id: 'ap12', pid: 'p4', did: 'd2', date: day(2), time: '11:30', status: 'pending', reason: 'Acne treatment', note: '', dx: '' },
      { id: 'ap13', pid: 'p4', did: 'd2', date: day(-25), time: '09:00', status: 'completed', reason: 'Acne consultation', note: 'Started topical retinoid. Sun protection advised.', dx: 'Acne vulgaris' },
      { id: 'ap14', pid: 'p4', did: 'd1', date: day(-3), time: '15:00', status: 'cancelled', reason: 'Chest pain consult', note: '', dx: '' },

      { id: 'ap15', pid: 'p5', did: 'd4', date: day(0), time: '15:00', status: 'confirmed', reason: 'Routine pediatric visit', note: '', dx: '' },
      { id: 'ap16', pid: 'p5', did: 'd4', date: day(-20), time: '09:00', status: 'completed', reason: 'Vaccination — DTP booster', note: 'DTP booster administered, no reaction observed.', dx: 'Preventive care' },
      { id: 'ap17', pid: 'p5', did: 'd4', date: day(12), time: '10:30', status: 'pending', reason: 'Growth follow-up', note: '', dx: '' }
    ],

    docs: [
      { id: 'dc1', pid: 'p1', title: 'Lipid panel results', cat: 'Laboratory', date: day(-31), by: 'd1', apptId: 'ap1', tags: 'cholesterol, blood', ver: 1 },
      { id: 'dc2', pid: 'p1', title: 'Amlodipine prescription', cat: 'Prescription', date: day(-30), by: 'd1', apptId: 'ap1', tags: 'hypertension', ver: 1 },
      { id: 'dc3', pid: 'p1', title: 'Cardiology consultation summary', cat: 'Consultation summary', date: day(-30), by: 'd1', apptId: 'ap1', tags: 'follow-up', ver: 2 },
      { id: 'dc4', pid: 'p1', title: 'Full blood count — lab order', cat: 'Laboratory', date: day(-2), by: 'd1', apptId: '', tags: 'pending results', ver: 1 },

      { id: 'dc5', pid: 'p2', title: 'Spirometry report', cat: 'Laboratory', date: day(-21), by: 'd3', apptId: '', tags: 'asthma, respiratory', ver: 1 },
      { id: 'dc6', pid: 'p2', title: 'Asthma action plan', cat: 'Consultation summary', date: day(-21), by: 'd3', apptId: '', tags: 'inhaler', ver: 1 },

      { id: 'dc7', pid: 'p3', title: 'Clobetasol prescription', cat: 'Prescription', date: day(-14), by: 'd2', apptId: 'ap10', tags: 'topical', ver: 1 },
      { id: 'dc8', pid: 'p3', title: 'Dermatology photo — baseline', cat: 'Imaging', date: day(-14), by: 'd2', apptId: 'ap10', tags: 'skin', ver: 1 },

      { id: 'dc9', pid: 'p4', title: 'Acne treatment plan', cat: 'Consultation summary', date: day(-25), by: 'd2', apptId: 'ap13', tags: 'retinoid', ver: 1 },
      { id: 'dc10', pid: 'p5', title: 'Vaccination certificate', cat: 'Certificate', date: day(-20), by: 'd4', apptId: 'ap16', tags: 'dtp, school', ver: 1 }
    ],

    meds: [
      { id: 'm1', pid: 'p1', name: 'Amlodipine', dose: '5 mg · once daily, morning', start: day(-30), end: day(60), remind: true, by: 'd1' },
      { id: 'm2', pid: 'p1', name: 'Atorvastatin', dose: '10 mg · once daily, evening', start: day(-31), end: day(59), remind: true, by: 'd1' },
      { id: 'm3', pid: 'p3', name: 'Clobetasol cream', dose: 'Thin layer · twice daily', start: day(-14), end: day(-1), remind: false, by: 'd2' },
      { id: 'm4', pid: 'p5', name: 'Vitamin D drops', dose: '1 drop · once daily', start: day(-10), end: day(40), remind: true, by: 'd4' }
    ],

    notifs: [
      { id: 'n1', to: 'p1', text: 'Follow-up consultation confirmed for today at 14:30.', date: day(0), read: false },
      { id: 'n2', to: 'p1', text: 'New document available: Full blood count — lab order.', date: day(-2), read: false },
      { id: 'n3', to: 'p1', text: 'Reminder: bring your current prescriptions to your next visit.', date: day(-5), read: true },
      { id: 'n4', to: 'd1', text: 'New booking request: Amine Khelifi — Lab results review.', date: day(0), read: false },
      { id: 'n5', to: 'd1', text: 'Full blood count results uploaded for Amine Khelifi.', date: day(-2), read: true },
      { id: 'n6', to: 'a1', text: 'Registration request: Rania Saidi is waiting for approval.', date: day(0), read: false },
      { id: 'n7', to: 'p2', text: 'Asthma review confirmed for today at 09:30.', date: day(0), read: true },
      { id: 'n8', to: 'p5', text: 'Vaccination certificate is available in your documents.', date: day(-20), read: true }
    ],

    audit: [
      { ts: day(0) + ' 08:30', by: 'Sana Ben Ali (admin)', a: 'Announcement sent to doctors' },
      { ts: day(-1) + ' 16:12', by: 'Karim Trabelsi (doctor)', a: 'Viewed dossier of Amine Khelifi' },
      { ts: day(-1) + ' 15:40', by: 'Sana Ben Ali (admin)', a: 'Created user Yasmine Ben Salah' },
      { ts: day(-2) + ' 09:05', by: 'Omar Jebali (doctor)', a: 'Appt ap7 → missed' },
      { ts: day(-2) + ' 08:58', by: 'Amine Khelifi (patient)', a: 'Downloaded Lipid panel results' }
    ],

    clinic: { name: 'MediLife Clinic', hours: 'Mon–Fri 08:00–18:00', phone: '+216 70 000 000' }
  };
}
