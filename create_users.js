const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://idjxzhzyadykcvuavszf.supabase.co';
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USERS = [
  // Dept 1
  { email:'tunlawit.s@ku.th', pass:'TS16@ku', name:'รศ.ดร.ตุลวิทย์ สถาปนจารุ', role:'admin', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'คณบดี', advisor:false, head:false, dean:true },
  { email:'ann.k@ku.th', pass:'AK11@ku', name:'ดร.แอน กำภู ณ อยุธยา', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'หัวหน้าภาควิชา', advisor:true, head:true, dean:false },
  { email:'jukkrit.m@ku.th', pass:'JM15@ku', name:'ผศ.ดร.จักรกฤษณ์ มหัจจริยวงศ์', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'prapaipid.c@ku.th', pass:'PC17@ku', name:'ผศ.ดร.ประไพพิศ ชัยรัตนมโนกร', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:true, dean:false },
  { email:'jutamas.b@ku.th', pass:'JB15@ku', name:'ดร.จุฑามาศ บุษราคัม', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'อาจารย์', advisor:true, head:false, dean:false },
  { email:'chanat.c@ku.th', pass:'CC14@ku', name:'รศ.ดร.ชนัต โชคเจริญรัตน์', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'chalor.j@ku.th', pass:'CJ14@ku', name:'รศ.ดร.ชลอ จารุสุทธิรักษ์', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'thunyapat.t@ku.th', pass:'TT17@ku', name:'ผศ.ดร.ธัญญลักษณ์ ทองเย็น', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'pawee.k@ku.th', pass:'PK13@ku', name:'ผศ.ดร.ปวีร์ คล่องเวสสะ', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'patthra.p@ku.th', pass:'PP15@ku', name:'รศ.ดร.ภัทรา เพ่งธรรมกีรติ', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'pasinee.w@ku.th', pass:'PW15@ku', name:'ผศ.ดร.ภาสินี วรชนะนันท์', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'ratcha.c@ku.th', pass:'RC14@ku', name:'รศ.ดร.รัฐชา ชัยชนะ', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'rattanawan.m@ku.th', pass:'RM18@ku', name:'รศ.ดร.รัตนาวรรณ มั่งคั่ง', role:'teacher', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'sawitree.b@ku.th', pass:'SB16@ku', name:'นางสาวสาวิตรี บ่อเกิด', role:'admin', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'นักวิชาการศึกษา', advisor:false, head:false, dean:false },
  { email:'suneerutn.s@ku.th', pass:'SS17@ku', name:'นางสาวสุนีรุตน์ สกุลสาครชัย', role:'admin', dept:'ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม', pos:'เจ้าหน้าที่บริหาร', advisor:false, head:false, dean:false },
  // Dept 2
  { email:'alongkorn.i@ku.th', pass:'AI17@ku', name:'ผศ.ดร.อลงกรณ์ อินทรักษา', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:true, dean:false },
  { email:'kasem.c@ku.th', pass:'KC13@ku', name:'ศ.เกียรติคุณ ดร.เกษม จันทร์แก้ว', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ศาสตราจารย์เกียรติคุณ', advisor:true, head:false, dean:false },
  { email:'thitima.r@ku.th', pass:'TR15@ku', name:'รศ.ดร.ฐิติมา รุ่งรัตนาอุบล', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'thanit.p@ku.th', pass:'TP14@ku', name:'ผศ.ดร.ธนิต ปัทมพิทูน', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'noppawan.s@ku.th', pass:'NS16@ku', name:'ผศ.ดร.นพวรรณ เสมวิมล', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'narouchit.d@ku.th', pass:'ND17@ku', name:'ผศ.ดร.นโรชิต ดำพิน', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'nipon.t@ku.th', pass:'NT13@ku', name:'ศ.ดร.นิพนธ์ ตั้งธรรม', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ศาสตราจารย์เกียรติคุณ', advisor:true, head:false, dean:false },
  { email:'pricha.d@ku.th', pass:'PD14@ku', name:'รศ.ปรีชา ธรรมมนน', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'panita.s@ku.th', pass:'PS14@ku', name:'ผศ.พนิตา โซตัง', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'paiboon.p@ku.th', pass:'PBN15@ku', name:'รศ.ดร.ไพบูลย์ ประพุทธธรรม', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'parkpoom.c@ku.th', pass:'PC16@ku', name:'รศ.ดร.ภาคภูมิ ชูมณี', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'parkin.m@ku.th', pass:'PM14@ku', name:'ดร.ภาคิน มาศกุลรัตน์', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'อาจารย์', advisor:true, head:false, dean:false },
  { email:'watcharapong.w@ku.th', pass:'WW20@ku', name:'ผศ.ดร.วัชรพงษ์ วาระรัมย์', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'vilai.s@ku.th', pass:'VS13@ku', name:'รศ.ดร.วิไล สันติโสภาศรี', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'satreethai.p@ku.th', pass:'SP18@ku', name:'ผศ.ดร.สตรีไทย พูมไม้', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'somnimirt.p@ku.th', pass:'SP17@ku', name:'ผศ.ดร.สมนึก พุกงาม', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'samakkee.b@ku.th', pass:'SMK16@ku', name:'รศ.ดร.สมัคร บุญยะวัฒน์', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'sujinna.k@ku.th', pass:'SK15@ku', name:'รศ.ดร.สุจินณา กรรณสุต', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'suthee.j@ku.th', pass:'SJ14@ku', name:'ผศ.ดร.สุทธี จรรย์สุทธิ์วงศ์', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'surat.b@ku.th', pass:'SB13@ku', name:'รศ.ดร.สุรัตน์ บัวเลิศ', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'onanong.p@ku.th', pass:'OP15@ku', name:'รศ.ดร.อรอนงค์ ผิวนิล', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'kittichai.d@ku.th', pass:'KD17@ku', name:'ผศ.ดร.กิตติชัย ดวงมาลย์', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'ittiphon.r@ku.th', pass:'IR16@ku', name:'รศ.อิทธิพล รัศมีเครืองไกร', role:'teacher', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'รองศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'sutee.c@ku.th', pass:'SC13@ku', name:'นายสุชีพ ข้อวงค์', role:'admin', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'นักวิทยาศาสตร์', advisor:false, head:false, dean:false },
  { email:'sittinon.l@ku.th', pass:'SL16@ku', name:'นายสิทธินนท์ ล้ำเลิง', role:'admin', dept:'ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม', pos:'เจ้าหน้าที่บริหาร', advisor:false, head:false, dean:false },
  // Dept 3
  { email:'maneekarn.yo@ku.th', pass:'MY18@ku', name:'ผศ.ดร.มณีกาญจน์ อยู่เยี่ยม', role:'teacher', dept:'ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน', pos:'ผู้ช่วยศาสตราจารย์', advisor:true, head:false, dean:false },
  { email:'athitaya.ch@ku.th', pass:'AC17@ku', name:'ดร.อาทิตยา ช่างตัวง', role:'teacher', dept:'ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน', pos:'อาจารย์', advisor:true, head:false, dean:false },
  { email:'athaphon.angk@ku.th', pass:'AA19@ku', name:'ดร.อธาพล อ้างแก้ว', role:'teacher', dept:'ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน', pos:'อาจารย์', advisor:true, head:false, dean:false },
  { email:'thanapat.jans@ku.th', pass:'TJ19@ku', name:'ดร.ธนพัฒน์ จันทร์สระคู', role:'teacher', dept:'ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน', pos:'อาจารย์', advisor:true, head:false, dean:false },
  { email:'ploypailin.ro@ku.th', pass:'PR19@ku', name:'ดร.พลอยไพลิน ร่มโพธิ์กัดดี', role:'teacher', dept:'ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน', pos:'อาจารย์', advisor:true, head:false, dean:false },
  // Admin
  { email:'kobkan.p@ku.th', pass:'KP14@ku', name:'นางสาวกอบกาญจน์ เมือกชุ่ม', role:'admin', dept:'สำนักงานคณะ', pos:'นักวิชาการศึกษา', advisor:false, head:false, dean:false },
  { email:'rampai.s@ku.th', pass:'RS14@ku', name:'นางรำไพ สีจำปา', role:'admin', dept:'สำนักงานคณะ', pos:'เจ้าหน้าที่บริหาร', advisor:false, head:false, dean:false },
  { email:'chesadaphon.b@ku.th', pass:'CB19@ku', name:'นายเชษฐาพร บุตรคำโชติ', role:'admin', dept:'สำนักงานคณะ', pos:'นักเทคโนโลยีสารสนเทศ', advisor:false, head:false, dean:false },
];

async function main() {
  let ok = 0, fail = 0;
  for (const u of USERS) {
    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email, password: u.pass, email_confirm: true,
        user_metadata: { name: u.name }
      });
      if (authErr) {
        if (authErr.message.includes('already been registered')) {
          console.log(`[SKIP] ${u.email} (already exists)`);
          // Update existing user password
          const { data: existing } = await supabase.auth.admin.listUsers();
          const found = existing?.users?.find(x => x.email === u.email);
          if (found) {
            await supabase.auth.admin.updateUserById(found.id, { password: u.pass, user_metadata: { name: u.name } });
            // Update public.users
            await supabase.from('users').upsert({ id: found.id, email: u.email, name: u.name, role: u.role, department: u.dept, faculty: 'คณะสิ่งแวดล้อม' }, { onConflict: 'email' });
            if (u.role === 'teacher') {
              await supabase.from('teachers').upsert({ user_id: found.id, position: u.pos, is_advisor: u.advisor, is_department_head: u.head, is_dean: u.dean }, { onConflict: 'user_id' });
            }
            ok++;
          }
          continue;
        }
        throw authErr;
      }
      const uid = authData.user.id;
      // 2. Insert public.users
      const { error: uErr } = await supabase.from('users').upsert({ id: uid, email: u.email, name: u.name, role: u.role, department: u.dept, faculty: 'คณะสิ่งแวดล้อม' }, { onConflict: 'email' });
      if (uErr) throw uErr;
      // 3. Insert public.teachers
      if (u.role === 'teacher') {
        const { error: tErr } = await supabase.from('teachers').upsert({ user_id: uid, position: u.pos, is_advisor: u.advisor, is_department_head: u.head, is_dean: u.dean }, { onConflict: 'user_id' });
        if (tErr) throw tErr;
      }
      console.log(`[OK] ${u.email}`);
      ok++;
    } catch(e) {
      console.error(`[FAIL] ${u.email}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} success, ${fail} failed`);
}

main();
