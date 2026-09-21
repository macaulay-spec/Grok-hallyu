// Hallyu backend cost model — see 04-feasibility-and-cost-model.md. Run: node docs/backend/cost-model.js
// Hallyu traffic + cost model (per MAU per month assumptions)
const A = {
  sessions: 12, apiPerSession: 25, apiRespKB: 4,            // PostgREST/RPC
  posts: 0.4, comments: 1.2, reactions: 8, saves: 1, follows: 1.5, watch: 6, searches: 8, reports: 0.02,
  notifs: 12, pushes: 8,
  imgUp: 0.35, imgKB: 300, imgThumbKB: 60,                   // 2 variants per image
  vidUp: 0.06, vidMB: 22, posterKB: 60,
  imgViews: 250, imgOpens: 20, vidPlays: 30, vidDeliveredMB: 8,
  rangeReqPerPlay: 10,
  dbKBperMAU: 20,                                            // rows+indexes growth
  liveRoomPeakFrac: 0.005, liveMsgs: 24,
  analyticsEvents: 25, emailsPerSignup: 1.2, signupRateOfRegPerMonth: 0.08,
};
const GB = 1024;
function month(mau, monthsElapsed, registered) {
  const api = mau * A.sessions * A.apiPerSession;
  const egressGB = api * A.apiRespKB / 1024 / 1024;
  const dbGrowthMB = mau * A.dbKBperMAU / 1024;
  const dbSizeMB = 50 + dbGrowthMB * monthsElapsed;           // 50 MB base (catalog mirror + system)
  const mediaGrowthGB = mau * ((A.imgUp * (A.imgKB + A.imgThumbKB) / 1024) + (A.vidUp * A.vidMB) + (A.vidUp * A.posterKB / 1024)) / 1024;
  const mediaGB = mediaGrowthGB * monthsElapsed;
  const classB = mau * (A.imgViews + A.imgOpens + A.vidPlays * A.rangeReqPerPlay);
  const classA = mau * (A.imgUp * 2 + A.vidUp * 3);
  const deliveredGB = mau * ((A.imgViews * A.imgThumbKB + A.imgOpens * A.imgKB) / 1024 / 1024 + A.vidPlays * A.vidDeliveredMB / 1024);
  const rtPeak = Math.round(mau * A.liveRoomPeakFrac);
  const rtMsgs = mau * A.liveMsgs;
  const pushes = mau * A.pushes;
  const edgeFn = mau * (A.posts + A.imgUp + A.vidUp) + 43200 + mau * 0.05; // moderation + cron dispatch + catalog
  const emails = (registered ? registered * A.signupRateOfRegPerMonth : mau * 0.1) * A.emailsPerSignup;
  const events = mau * A.analyticsEvents;
  return { api, egressGB, dbGrowthMB, dbSizeMB, mediaGrowthGB, mediaGB, classB, classA, deliveredGB, rtPeak, rtMsgs, pushes, edgeFn, emails, events };
}
function cost(m, mau) {
  const lines = [];
  let supabase = 0;
  const needsPro = m.dbSizeMB > 450 || m.egressGB > 5 || mau > 45000 || m.rtPeak > 180;
  if (needsPro) {
    supabase += 25; lines.push('Supabase Pro $25');
    // compute
    let compute = 0, label = 'Micro (credit)';
    if (mau > 150000) { compute = 210; label = 'XL $210'; }
    else if (mau > 75000) { compute = 110; label = 'Large $110'; }
    else if (mau > 30000) { compute = 60; label = 'Medium $60'; }
    else if (mau > 8000) { compute = 15; label = 'Small $15'; }
    compute = Math.max(0, compute - 10); if (compute) lines.push('compute ' + label + ' (−$10 credit)');
    supabase += compute;
    const dbOver = Math.max(0, m.dbSizeMB / 1024 - 8) * 0.125; if (dbOver > 0.5) { lines.push(`DB over 8 GB $${dbOver.toFixed(1)}`); supabase += dbOver; }
    const egOver = Math.max(0, m.egressGB - 250) * 0.09; if (egOver > 0.5) { lines.push(`egress over 250 GB $${egOver.toFixed(1)}`); supabase += egOver; }
    const mauOver = Math.max(0, mau - 100000) * 0.00325; if (mauOver) { lines.push(`MAU over 100K $${mauOver.toFixed(0)}`); supabase += mauOver; }
    const rtOver = Math.max(0, m.rtPeak - 500) / 1000 * 10; if (rtOver > 0.5) { lines.push(`Realtime peak over 500 $${rtOver.toFixed(1)}`); supabase += rtOver; }
  }
  let r2 = Math.max(0, m.mediaGB - 10) * 0.015 + Math.max(0, m.classB - 10e6) / 1e6 * 0.36 + Math.max(0, m.classA - 1e6) / 1e6 * 4.5;
  let workers = 0; // presign/complete only through Worker; GETs via custom domain
  const workerReqPerDay = mau * (A.imgUp * 2 + A.vidUp * 2 + 0.2) / 30;
  if (workerReqPerDay > 90000) { workers = 5; lines.push('Workers Paid $5'); }
  let email = 0; if (m.emails > 2800 || m.emails / 30 > 95) { email = 20; lines.push('Resend Pro $20'); }
  let posthog = 0; if (m.events > 1e6) { posthog = (m.events - 1e6) / 1e6 * 0.05 * 1000 / 1000; posthog = Math.round((m.events - 1e6) / 1e6 * 50); lines.push(`PostHog ~$${posthog}`); }
  const total = supabase + r2 + workers + email + posthog;
  return { supabase, r2, workers, email, posthog, total, lines, needsPro };
}
const fmt = (n, d = 1) => Number(n).toFixed(d);
console.log('== REGISTERED scenarios (MAU = 25% of registered), month 12 of steady state ==');
for (const reg of [1000, 10000, 50000, 100000, 200000]) {
  const mau = reg * 0.25; const m = month(mau, 12, reg); const c = cost(m, mau);
  console.log(`${reg} reg / ${mau} MAU: api ${(m.api/1e6).toFixed(2)}M/mo, egress ${fmt(m.egressGB)} GB, DB +${fmt(m.dbGrowthMB,0)} MB/mo (size@12mo ${fmt(m.dbSizeMB/1024,2)} GB), media +${fmt(m.mediaGrowthGB,2)} GB/mo (total@12mo ${fmt(m.mediaGB,0)} GB), delivered ${fmt(m.deliveredGB,0)} GB, classB ${(m.classB/1e6).toFixed(1)}M, RT peak ${m.rtPeak}, pushes ${(m.pushes/1e3).toFixed(0)}K, emails ${m.emails.toFixed(0)}, events ${(m.events/1e6).toFixed(2)}M`);
  console.log(`   cost: supabase $${fmt(c.supabase,0)} r2 $${fmt(c.r2,2)} workers $${c.workers} email $${c.email} posthog $${c.posthog} => TOTAL $${fmt(c.total,0)}  [${c.lines.join('; ')}]`);
  // months until walls
  const mDb = (450 - 50) / (m.dbGrowthMB); const mR2 = 10 / m.mediaGrowthGB;
  console.log(`   walls: DB 500MB in ${fmt(mDb,1)} months; R2 10GB in ${fmt(mR2,1)} months; egress ${m.egressGB > 5 ? 'OVER' : 'ok'}`);
}
console.log('\n== MAU scenarios, month 12 ==');
for (const mau of [10000, 50000, 100000, 200000]) {
  const m = month(mau, 12, null); const c = cost(m, mau);
  console.log(`${mau} MAU: api ${(m.api/1e6).toFixed(1)}M/mo, egress ${fmt(m.egressGB)} GB, DB +${fmt(m.dbGrowthMB/1024,2)} GB/mo (size@12mo ${fmt(m.dbSizeMB/1024,1)} GB), media +${fmt(m.mediaGrowthGB,1)} GB/mo (total@12mo ${fmt(m.mediaGB,0)} GB), delivered ${fmt(m.deliveredGB,0)} GB, classB ${(m.classB/1e6).toFixed(0)}M, RT peak ${m.rtPeak}, pushes ${(m.pushes/1e6).toFixed(2)}M, edgeFn ${(m.edgeFn/1e3).toFixed(0)}K, events ${(m.events/1e6).toFixed(1)}M`);
  console.log(`   cost: supabase $${fmt(c.supabase,0)} r2 $${fmt(c.r2,0)} workers $${c.workers} email $${c.email} posthog $${c.posthog} => TOTAL $${fmt(c.total,0)}  [${c.lines.join('; ')}]`);
}
console.log('\n== $0 boundary search ==');
for (const mau of [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]) {
  const m6 = month(mau, 6, null), m12 = month(mau, 12, null);
  console.log(`${mau} MAU: egress ${fmt(m6.egressGB,2)} GB; DB size @6mo ${fmt(m6.dbSizeMB,0)} MB, @12mo ${fmt(m12.dbSizeMB,0)} MB; R2 @6mo ${fmt(m6.mediaGB,1)} GB @12mo ${fmt(m12.mediaGB,1)} GB; classB ${(m6.classB/1e6).toFixed(2)}M; RT peak ${m6.rtPeak}`);
}
