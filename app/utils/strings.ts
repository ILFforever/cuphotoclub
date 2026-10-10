// Centralized Thai copy. Single source of truth so English can be layered on
// later via @nuxtjs/i18n without hunting through templates (the "i18n seam").
export const strings = {
  brand: 'CU Photo Club',
  footerTagline: 'ชมรมถ่ายภาพแห่งจุฬาลงกรณ์มหาวิทยาลัย',

  nav: {
    home: 'หน้าแรก',
    galleries: 'แกลเลอรี',
    activities: 'กิจกรรม',
    about: 'เกี่ยวกับเรา',
    contact: 'ติดต่อเรา'
  },

  home: {
    eyebrow: 'CU Photo Club',
    heroTitle: 'บันทึกทุกช่วงเวลาผ่านเลนส์',
    heroSubtitle: 'ภาพถ่ายกิจกรรม และผลงานจากชมรมถ่ายภาพ',
    viewGalleries: 'ดูแกลเลอรีทั้งหมด'
  }
} as const
