import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, GraduationCap, BookOpen, ArrowRight, CheckCircle, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

type RoleKey = 'student' | 'teacher' | 'admin';
interface RoleOption {
  key: RoleKey; label: string; sublabel: string; icon: typeof GraduationCap;
  cardBg: string; cardBorder: string; iconBg: string; iconColor: string;
  badge: string; demoEmail: string; demoPassword: string; emailPlaceholder: string;
}

const ROLES: RoleOption[] = [
  { key: 'student', label: 'นิสิต', sublabel: 'สำหรับนิสิตที่ต้องการยื่นคำร้องและติดตามสถานะ',
    icon: GraduationCap, cardBg: 'bg-blue-50 hover:bg-blue-100', cardBorder: 'border-blue-200 hover:border-blue-400',
    iconBg: 'bg-blue-600', iconColor: 'text-white', badge: 'bg-blue-100 text-blue-700',
    demoEmail: '', demoPassword: '', emailPlaceholder: 'รหัสนิสิต@ku.th' },
  { key: 'teacher', label: 'อาจารย์', sublabel: 'สำหรับอาจารย์ที่ทำหน้าที่พิจารณาและอนุมัติคำร้อง',
    icon: BookOpen, cardBg: 'bg-orange-50 hover:bg-orange-100', cardBorder: 'border-orange-200 hover:border-orange-400',
    iconBg: 'bg-orange-500', iconColor: 'text-white', badge: 'bg-orange-100 text-orange-700',
    demoEmail: '', demoPassword: '', emailPlaceholder: 'username@ku.th' },
];

export function LoginPage() {
  const [step, setStep] = useState<'role' | 'form'>('role');
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentDept, setStudentDept] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentCampus, setStudentCampus] = useState('bangkhen');
  const [studentLevel, setStudentLevel] = useState('ปริญญาตรี');
  const [studentYear, setStudentYear] = useState('1');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [adminClicks, setAdminClicks] = useState(0);
  const { login, loginAsStudent, logout, currentUser, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Auto redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser) {
      navigate(`/${currentUser.role}/dashboard`, { replace: true });
    }
  }, [currentUser, authLoading, navigate]);

  const resetStudent = () => { setStudentName(''); setStudentId(''); setStudentDept(''); setStudentEmail(''); setStudentCampus('bangkhen'); setStudentLevel('ปริญญาตรี'); setStudentYear('1'); };

  const doLogin = async () => {
    if (selectedRole?.key === 'student') {
      if (!studentName.trim() || !studentId.trim()) { toast.error('กรุณากรอกชื่อและรหัสนิสิต'); return; }
      if (!studentDept) { toast.error('กรุณาเลือกภาควิชา'); return; }
      if (!studentYear.trim() || isNaN(Number(studentYear)) || Number(studentYear) < 1) { toast.error('กรุณากรอกชั้นปีที่ถูกต้อง'); return; }
      const result = loginAsStudent(studentName, studentId, studentDept, studentEmail, studentCampus, studentLevel, Number(studentYear));
      toast.success(`ยินดีต้อนรับ, ${result.user.name}`);
      navigate('/student/dashboard'); return;
    }
    if (!email.trim() || !password.trim()) { toast.error('กรุณากรอกอีเมลและรหัสผ่าน'); return; }
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);
    if (result.success && result.user) {
      if (result.user.role === 'admin' && selectedRole?.key !== 'admin') {
        toast.error('บัญชีนี้เป็น Admin');
        await logout();
        return;
      }
      if (result.user.role === 'teacher' && selectedRole?.key === 'admin') {
        toast.error('บัญชีนี้ไม่มีสิทธิ์ Admin');
        await logout();
        return;
      }
      toast.success(`ยินดีต้อนรับ, ${result.user.name}`);
      navigate(`/${result.user.role}/dashboard`);
    } else { toast.error(result.message || 'เข้าสู่ระบบไม่สำเร็จ'); }
  };

  const handleSelectRole = (role: RoleOption) => { setSelectedRole(role); setEmail(''); setPassword(''); resetStudent(); setStep('form'); };
  const handleBack = () => { setStep('role'); setSelectedRole(null); setEmail(''); setPassword(''); resetStudent(); };
  const handleSecretAdmin = () => {
    const next = adminClicks + 1; setAdminClicks(next);
    if (next >= 5) {
      setAdminClicks(0);
      setSelectedRole({ key: 'admin', label: 'เจ้าหน้าที่ระบบ', sublabel: 'Admin access', icon: BookOpen,
        cardBg: 'bg-purple-50', cardBorder: 'border-purple-200', iconBg: 'bg-purple-700', iconColor: 'text-white',
        badge: 'bg-purple-100 text-purple-700', demoEmail: '', demoPassword: '', emailPlaceholder: 'admin@ku.th' });
      setEmail(''); setPassword(''); setStep('form'); toast.info('โหมดเจ้าหน้าที่');
    }
  };

  const activeRole = selectedRole;
  const features = ['ยื่นเอกสารออนไลน์ได้ทุกที่ทุกเวลา','ติดตามสถานะคำร้องแบบ Real-time','รับแจ้งเตือนผ่าน Email และ Google Chat','ระบบอนุมัติหลายชั้นอัตโนมัติ'];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundImage: `url('/login-bg.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>

      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(2,28,10,0.48)' }} />

      {/* Card wrapper — decorative elements sit here at z-20 */}
      <div className="relative z-10 w-full max-w-4xl">


        {/* === BUTTERFLY orange (top-right edge of card) === */}
        <div className="absolute top-16 -right-5 z-20 pointer-events-none w-20 h-16 select-none"
          style={{ animation: 'kuFloat 3s ease-in-out infinite' }}>
          <svg viewBox="0 0 100 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Upper left wing */}
            <path d="M50,42 C44,28 22,12 8,22 C-2,30 8,48 50,46" fill="#F97316" opacity="0.93"/>
            {/* Upper right wing */}
            <path d="M50,42 C56,28 78,12 92,22 C102,30 92,48 50,46" fill="#F97316" opacity="0.93"/>
            {/* Lower left wing */}
            <path d="M50,46 C38,52 18,58 20,72 C22,82 42,76 50,62" fill="#FDBA74" opacity="0.88"/>
            {/* Lower right wing */}
            <path d="M50,46 C62,52 82,58 80,72 C78,82 58,76 50,62" fill="#FDBA74" opacity="0.88"/>
            {/* Body */}
            <ellipse cx="50" cy="50" rx="3" ry="13" fill="#431407"/>
            <circle cx="50" cy="35" r="3.5" fill="#431407"/>
            {/* Antennae */}
            <path d="M48,33 C43,24 36,18 32,12" stroke="#431407" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M52,33 C57,24 64,18 68,12" stroke="#431407" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="32" cy="12" r="2.2" fill="#431407"/>
            <circle cx="68" cy="12" r="2.2" fill="#431407"/>
          </svg>
        </div>

        {/* === BUTTERFLY purple (left edge of card) === */}
        <div className="absolute top-1/2 -left-7 z-20 pointer-events-none w-18 h-14 select-none"
          style={{ animation: 'kuFloat 4.5s ease-in-out infinite 1.2s', width: '72px', height: '56px' }}>
          <svg viewBox="0 0 100 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Upper left wing */}
            <path d="M50,42 C44,28 22,12 8,22 C-2,30 8,48 50,46" fill="#A855F7" opacity="0.9"/>
            {/* Upper right wing */}
            <path d="M50,42 C56,28 78,12 92,22 C102,30 92,48 50,46" fill="#A855F7" opacity="0.9"/>
            {/* Lower left wing */}
            <path d="M50,46 C38,52 18,58 20,72 C22,82 42,76 50,62" fill="#C084FC" opacity="0.85"/>
            {/* Lower right wing */}
            <path d="M50,46 C62,52 82,58 80,72 C78,82 58,76 50,62" fill="#C084FC" opacity="0.85"/>
            {/* Body */}
            <ellipse cx="50" cy="50" rx="3" ry="13" fill="#2E1065"/>
            <circle cx="50" cy="35" r="3.5" fill="#2E1065"/>
            {/* Antennae */}
            <path d="M48,33 C43,24 36,18 32,12" stroke="#2E1065" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M52,33 C57,24 64,18 68,12" stroke="#2E1065" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="32" cy="12" r="2.2" fill="#2E1065"/>
            <circle cx="68" cy="12" r="2.2" fill="#2E1065"/>
          </svg>
        </div>

        {/* === LEAF (top-left floating) === */}
        <div className="absolute -top-8 left-10 z-20 pointer-events-none w-14 h-14 select-none opacity-90"
          style={{ animation: 'kuFloat 5s ease-in-out infinite 0.6s' }}>
          <svg viewBox="0 0 80 80"><path d="M40 5 C65 5,75 25,72 45 C69 65,50 75,40 75 C30 75,15 65,12 45 C9 25,15 5,40 5Z" fill="#22c55e" opacity="0.9"/>
            <path d="M40 10 C40 40,38 58,35 74" stroke="#15803d" strokeWidth="2" fill="none" strokeLinecap="round"/>
            <path d="M40 28 C50 24,60 27,68 34" stroke="#15803d" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            <path d="M40 46 C50 42,62 43,70 49" stroke="#15803d" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Animation keyframes */}
        <style>{`
          @keyframes kuFloat {
            0%,100%{transform:translateY(0) rotate(0deg);}
            33%{transform:translateY(-9px) rotate(4deg);}
            66%{transform:translateY(-4px) rotate(-3deg);}
          }
        `}</style>

        {/* === THE LOGIN CARD === */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 rounded-3xl shadow-2xl overflow-hidden min-h-[580px]"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(10px)' }}>

          {/* LEFT PANEL */}
          <div className="hidden lg:flex flex-col justify-between bg-gradient-to-b from-green-700 to-green-900 p-10 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-10 right-10 w-40 h-40 rounded-full border-4 border-white"/>
              <div className="absolute bottom-20 left-5 w-24 h-24 rounded-full border-2 border-white"/>
              <div className="absolute top-40 left-20 w-16 h-16 rounded-full border border-white"/>
            </div>
            <div className="relative z-10">
              <button onClick={handleSecretAdmin} className="flex items-center gap-3 mb-8 group">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-all">
                  <GraduationCap size={24} className="text-white"/>
                </div>
                <div><h1 className="text-xl font-bold">KU-Paper</h1><p className="text-green-200 text-xs">Kasetsart University</p></div>
              </button>
              <h2 className="text-2xl font-bold mb-3 leading-tight">ระบบยื่นเอกสาร<br/>ออนไลน์</h2>
              <p className="text-green-200 text-sm leading-relaxed mb-8">คณะสิ่งแวดล้อม มหาวิทยาลัยเกษตรศาสตร์<br/>Faculty of Environment</p>
              <div className="space-y-3">
                {features.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-green-300 shrink-0"/>
                    <span className="text-sm text-green-100">{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-green-300 text-xs relative z-10">© 2025 คณะสิ่งแวดล้อม มก.</p>
          </div>

          {/* RIGHT PANEL */}
          <div className="bg-white p-8 sm:p-10 flex flex-col">

            {/* STEP 1: Role Selection */}
            {step === 'role' && (
              <div className="flex flex-col h-full">
                <div className="mb-7">
                  <h2 onClick={handleSecretAdmin} className="text-green-800 text-xl font-semibold mb-1 cursor-pointer select-none">ขั้นตอนที่ 1</h2>
                  <p className="text-gray-500 text-sm">เลือกบทบาทของท่านในระบบ KU-Paper</p>
                </div>
                <div className="space-y-4 flex-1">
                  {ROLES.map(role => {
                    const Icon = role.icon;
                    return (
                      <button key={role.key} onClick={() => handleSelectRole(role)}
                        className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all group ${role.cardBg} ${role.cardBorder}`}>
                        <div className={`w-12 h-12 rounded-xl ${role.iconBg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                          <Icon size={22} className={role.iconColor}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-gray-800 text-sm font-semibold">{role.label}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${role.badge}`}>{role.key === 'student' ? 'Student' : 'Faculty'}</span>
                          </div>
                          <p className="text-gray-500 text-xs leading-relaxed">{role.sublabel}</p>
                        </div>
                        <ArrowRight size={18} className="text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all shrink-0"/>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 border-t border-gray-100 pt-4 text-center">
                  <p onClick={handleSecretAdmin} className="text-xs text-gray-400 cursor-pointer select-none">ระบบสำหรับบุคลากรและนิสิต มก. เท่านั้น</p>
                  <p className="text-xs text-gray-500 mt-2 flex items-center justify-center gap-1.5">
                    <span className="font-semibold text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded uppercase shrink-0">LINE ADMIN</span>
                    <span className="select-all font-mono font-medium text-xs text-gray-700">@line 0949906050</span>
                  </p>
                </div>
              </div>
            )}

            {/* STEP 2: Login Form */}
            {step === 'form' && activeRole && (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <button onClick={handleBack} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                    <ChevronLeft size={18}/>
                  </button>
                  <div>
                    <h2 className="text-green-800 text-xl font-semibold">ขั้นตอนที่ 2</h2>
                    <p className="text-gray-500 text-sm">กรอกข้อมูลเพื่อยืนยันตัวตน</p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 mb-6 ${activeRole.cardBg} ${activeRole.cardBorder}`}>
                  <div className={`w-8 h-8 rounded-lg ${activeRole.iconBg} flex items-center justify-center shrink-0`}>
                    <activeRole.icon size={16} className={activeRole.iconColor}/>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{activeRole.label}</p>
                    <p className="text-xs text-gray-500">เปลี่ยนบทบาท → กดลูกศรย้อนกลับ</p>
                  </div>
                </div>
                <form onSubmit={e => { e.preventDefault(); doLogin(); }} className="space-y-4 flex-1">
                  {activeRole.key === 'student' ? (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                        ℹ️ นิสิตไม่ต้องตั้งรหัสผ่าน — กรอกชื่อและรหัสนิสิตแล้วเข้าใช้งานได้เลย
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">ชื่อ-นามสกุล <span className="text-red-500 ml-1">*</span></label>
                        <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)}
                          placeholder="เช่น สมชาย ใจดี" autoFocus
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">รหัสนิสิต <span className="text-red-500 ml-1">*</span></label>
                        <input type="text" value={studentId} onChange={e => setStudentId(e.target.value)}
                          placeholder="เช่น 6510000000"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">วิทยาเขต <span className="text-red-500 ml-1">*</span></label>
                        <select value={studentCampus} onChange={e => setStudentCampus(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-white">
                          <option value="bangkhen">วิทยาเขตบางเขน (Bang Khen)</option>
                          <option value="kamphaengsaen">วิทยาเขตกำแพงแสน (Kamphaeng Saen)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">ภาควิชา <span className="text-red-500 ml-1">*</span></label>
                        <select value={studentDept} onChange={e => setStudentDept(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-white">
                          <option value="">-- เลือกภาควิชา --</option>
                          <option value="ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม">ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม</option>
                          <option value="ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม">ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม</option>
                          <option value="ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน">ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน</option>
                        </select>
                      </div>
                      {/* ระดับการศึกษา */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-700 mb-1.5 font-medium">ระดับการศึกษา <span className="text-red-500 ml-1">*</span></label>
                          <select value={studentLevel} onChange={e => setStudentLevel(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-white">
                            <option value="ปริญญาตรี">ปริญญาตรี</option>
                            <option value="ปริญญาโท">ปริญญาโท</option>
                            <option value="ปริญญาเอก">ปริญญาเอก</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700 mb-1.5 font-medium">ชั้นปี <span className="text-red-500 ml-1">*</span></label>
                          <input type="number" min={1} max={8} value={studentYear} onChange={e => setStudentYear(e.target.value)}
                            placeholder="เช่น 1"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">
                          อีเมล <span className="text-gray-400 font-normal">(optional — รับแจ้งเตือนสถานะคำร้อง)</span>
                        </label>
                        <input type="email" value={studentEmail} onChange={e => setStudentEmail(e.target.value)}
                          placeholder="เช่น test.t@ku.th"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">อีเมล</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                          placeholder={activeRole.emailPlaceholder} autoFocus
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"/>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1.5 font-medium">รหัสผ่าน</label>
                        <div className="relative">
                          <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all pr-10"/>
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <button type="submit" disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all font-medium shadow-sm mt-2">
                    {isLoading
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                      : <><span>{activeRole.key === 'student' ? 'เข้าใช้งาน' : 'เข้าสู่ระบบ'}</span><ArrowRight size={16}/></>
                    }
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
