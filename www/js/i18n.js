const dict = {
  en: {
    app: 'Inkwell', search: 'Search notebooks', newNote: 'New blank notebook', importDoc: 'Import a file',
    importPdf: 'PDF document', importWord: 'Word document', importPpt: 'PowerPoint slides',
    emptyTitle: 'Your library is empty', emptyText: 'Import a PDF, Word or PowerPoint file, or start a blank notebook. Everything stays on your device.',
    recent: 'Recent', pages: '{n} pages', page1: '1 page', open: 'Open', rename: 'Rename', exportPdf: 'Export as PDF', exportImage: 'Export page as image',
    del: 'Delete', deleteTitle: 'Delete this notebook?', deleteText: 'This removes the notebook and all your notes on it from this device.',
    cancel: 'Cancel', ok: 'OK', save: 'Save', settings: 'Settings', language: 'Language', fingerDraw: 'Draw with finger',
    fingerDrawHint: 'Turn off to draw only with a stylus; fingers then scroll and zoom.',
    hand: 'Move', pen: 'Pen', hl: 'Highlighter', eraser: 'Eraser', text: 'Text', shapes: 'Shapes', color: 'Color', size: 'Size',
    line: 'Line', arrow: 'Arrow', rect: 'Rectangle', oval: 'Oval', undo: 'Undo', redo: 'Redo',
    addPage: 'Add page', deletePage: 'Delete this page', deletePageTitle: 'Delete this page?', deletePageText: 'The page and everything written on it will be removed.',
    onlyPage: 'A notebook needs at least one page.', pageList: 'Pages', blank: 'Blank', lined: 'Lined', grid: 'Grid', dots: 'Dots', template: 'Page style',
    exporting: 'Exporting…', importing: 'Importing…', preparing: 'Preparing pages…',
    errLegacy: 'Old .doc / .ppt files are not supported. Open the file in Word/PowerPoint and save it as .docx / .pptx first.',
    errType: 'This file type is not supported. Use PDF, DOCX or PPTX.', errFailed: 'Could not open this file.', errExport: 'Export failed.',
    enterPassword: 'This PDF is password protected. Enter the password:', typeHere: 'Type here', untitled: 'Untitled', noResults: 'No matches',
    saved: 'Saved', shared: 'Ready to share', fit: 'Fit width', back: 'Back', more: 'More', close: 'Close', note: 'Note', done: 'Done',
    kindPdf: 'PDF', kindDocx: 'Word', kindPptx: 'Slides', kindBlank: 'Note', imported: 'Imported', zoom: 'Zoom',
    helpTitle: 'Tips', help1: 'Two fingers: scroll and pinch to zoom.', help2: 'Tap the active tool again to change color and size.', help3: 'Your notebooks are stored on this device only.',
  },
  ar: {
    app: 'إنكويل', search: 'ابحث في الدفاتر', newNote: 'دفتر فارغ جديد', importDoc: 'استيراد ملف',
    importPdf: 'ملف PDF', importWord: 'ملف Word', importPpt: 'عرض PowerPoint',
    emptyTitle: 'مكتبتك فارغة', emptyText: 'استورد ملف PDF أو Word أو PowerPoint، أو ابدأ دفتراً فارغاً. كل شيء يبقى على جهازك.',
    recent: 'الأحدث', pages: '{n} صفحات', page1: 'صفحة واحدة', open: 'فتح', rename: 'إعادة تسمية', exportPdf: 'تصدير كملف PDF', exportImage: 'تصدير الصفحة كصورة',
    del: 'حذف', deleteTitle: 'حذف هذا الدفتر؟', deleteText: 'سيتم حذف الدفتر وكل ملاحظاتك عليه من هذا الجهاز.',
    cancel: 'إلغاء', ok: 'موافق', save: 'حفظ', settings: 'الإعدادات', language: 'اللغة', fingerDraw: 'الرسم بالإصبع',
    fingerDrawHint: 'أوقفه للرسم بالقلم فقط؛ وعندها تتحرك الأصابع وتكبّر فقط.',
    hand: 'تحريك', pen: 'قلم', hl: 'قلم تمييز', eraser: 'ممحاة', text: 'نص', shapes: 'أشكال', color: 'اللون', size: 'الحجم',
    line: 'خط', arrow: 'سهم', rect: 'مستطيل', oval: 'دائرة', undo: 'تراجع', redo: 'إعادة',
    addPage: 'إضافة صفحة', deletePage: 'حذف هذه الصفحة', deletePageTitle: 'حذف هذه الصفحة؟', deletePageText: 'ستُحذف الصفحة وكل ما كُتب عليها.',
    onlyPage: 'يجب أن يحتوي الدفتر على صفحة واحدة على الأقل.', pageList: 'الصفحات', blank: 'فارغة', lined: 'مسطّرة', grid: 'شبكة', dots: 'نقاط', template: 'نمط الصفحة',
    exporting: 'جارٍ التصدير…', importing: 'جارٍ الاستيراد…', preparing: 'جارٍ تجهيز الصفحات…',
    errLegacy: 'ملفات .doc / .ppt القديمة غير مدعومة. افتح الملف في Word/PowerPoint واحفظه بصيغة .docx / .pptx أولاً.',
    errType: 'نوع الملف غير مدعوم. استخدم PDF أو DOCX أو PPTX.', errFailed: 'تعذّر فتح هذا الملف.', errExport: 'فشل التصدير.',
    enterPassword: 'ملف PDF هذا محمي بكلمة مرور. أدخل كلمة المرور:', typeHere: 'اكتب هنا', untitled: 'بدون عنوان', noResults: 'لا توجد نتائج',
    saved: 'تم الحفظ', shared: 'جاهز للمشاركة', fit: 'ملاءمة العرض', back: 'رجوع', more: 'المزيد', close: 'إغلاق', note: 'ملاحظة', done: 'تم',
    kindPdf: 'PDF', kindDocx: 'Word', kindPptx: 'شرائح', kindBlank: 'ملاحظة', imported: 'تم الاستيراد', zoom: 'تكبير',
    helpTitle: 'نصائح', help1: 'بإصبعين: مرّر وكبّر بالقرص.', help2: 'اضغط على الأداة المحددة مرة أخرى لتغيير اللون والحجم.', help3: 'دفاترك محفوظة على هذا الجهاز فقط.',
  },
};

let lang = 'en';
try {
  lang = localStorage.getItem('ink.lang') || ((navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en');
} catch { /* storage unavailable */ }

export const getLang = () => lang;
export function t(key, vars) {
  let s = (dict[lang] && dict[lang][key]) ?? dict.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('ink.lang', l); } catch { /* ignore */ }
  applyLang();
}
export function applyLang(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); n.setAttribute('aria-label', t(n.dataset.i18nTitle)); });
}
