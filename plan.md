# Implementation Plan - Feature Updates

## สิ่งที่ต้องทำ (เรียงตาม Priority)

### 1. นิสิตดาวน์โหลดฟอร์มได้ [SubmitForm.tsx]
- เพิ่มหน้า "ดาวน์โหลดแบบฟอร์ม" ก่อน Step 1 ของการยื่นคำร้อง
- ดึงจาก forms_library + แสดงชื่อ, คำอธิบาย, วิธีใช้, ปุ่มดาวน์โหลด

### 2. Admin Login Separation [LoginPage.tsx + AuthContext.tsx]
- อาจารย์ที่ role='admin' ใน DB → ให้ error "บัญชีนี้เป็น Admin กรุณาใช้ช่องทาง Admin"
- Admin เข้าได้ทางเดียว: hidden trigger (คลิก logo 5 ครั้ง)

### 3. Admin จัดการ Role อาจารย์ [UserManager.tsx]
- เพิ่ม toggle: อาจารย์ที่ปรึกษา / หัวหน้าภาค / คณบดี
- แสดงตำแหน่งจากตาราง teachers (position field)
- Admin กำหนด is_advisor, is_department_head, is_dean ได้

### 4. ลบ Mock/Test Users [SQL]
- ลบ somsak.w@ku.th และ user ทดลองอื่นๆ

### 5. Admin ดูข้อมูลนิสิตที่เคยยื่น [UserManager.tsx]
- แสดงรายชื่อนิสิต (ชื่อ + รหัส) ที่เคยยื่นคำร้องในระบบ

### 6. Admin ดูข้อมูล Login อาจารย์
- เพิ่ม tab ใน UserManager แสดง email + pass (plain text ที่เราเก็บไว้)
- เพิ่มคอลัมน์ plain_password ใน public.users
