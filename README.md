# Inkwell — free notes app for PDF, Word and PowerPoint

Open PDF, Word (.docx) and PowerPoint (.pptx) files and write on them: pen, highlighter, eraser, text boxes, shapes,
extra pages, undo/redo. **Select and copy text, highlight / underline / strike through words, and organise notebooks in
folders.** Everything is stored on your phone. English and Arabic.

## Get the APK (free, about 10 minutes, no Android Studio needed)

You need a free GitHub account. A phone works: open github.com in Chrome and turn on **Desktop site** (⋮ menu).

1. Create a repository (**+ → New repository**, name it `inkwell`).
2. Upload **`Inkwell-Android-Project.zip`** itself (**Add file → Upload files**). GitHub does not need it unzipped.
   On a computer you may instead unzip it and upload the files inside (about 80 files, which fits in one upload).
3. **Add file → Create new file**, type the name `.github/workflows/build-apk.yml`, paste the contents of
   `build-apk.workflow.yml` (it is inside the zip) and **Commit changes**.
4. Open the **Actions** tab. The build starts by itself (or press **Run workflow**). Wait 5–10 minutes for the green ✓.
5. Get the APK from either place:
   - **Releases** (right side of the repository's main page) → the newest *Inkwell build* → tap **app-debug.apk**.
   - or the finished run → **Artifacts** → *Inkwell-APK* (a zip containing `app-debug.apk`).
6. Open the APK on the phone. Allow "install from this source" if Android asks.

If the build fails (red ✗), open the failed step, copy the last 30 lines of the log (or take a screenshot) and send it to me.

If, after installing, the screen only shows an empty green button and nothing responds, the update was only partly
uploaded. The app then shows a message that lists the missing or old files. Fix: upload `Inkwell-Android-Project.zip`
by itself to the main page of the repository (it wins over any loose files uploaded earlier) and wait for the new build.

### Updating the app later
Upload the new `Inkwell-Android-Project.zip` to the same repository (same file name, it replaces the old one) and the
build runs again. Every build is signed with the same key (`signing/debug.keystore`) and has a higher version number, so
the new APK installs **over** the old one and your notebooks stay. (Only the very first APK made before this key existed
has to be uninstalled once. Export what you need as PDF first.)

## Using the new features

- **Select text**: pick the I-beam tool, tap a word, or press and hold and drag across words. Move the two round handles
  to change the selection. The bar offers **Copy**, four **highlight** colours, **underline** and **strikethrough**
  (underline and strikethrough use the current pen colour). Select a marked word again to get a trash button that removes
  the mark. Undo / redo and the eraser work on marks too.
- **Smart pen** (on by default; switch it off in Settings): pen strokes are smoothed, and a line you drew roughly straight
  becomes a straight line (and snaps to exactly horizontal or vertical when it is close). The **highlighter snaps to the
  text**: drag it over words, even a little crooked or off the line, and it turns into a neat highlight of exactly those
  words (words you barely touch are left out). Over a picture or empty space it stays a clean highlighter stroke. Undo and
  the eraser work on it as usual. On scanned pages there is no text to snap to, so you get a smooth, straight stroke.
- **Text tool**: tap where you want to type; the keyboard opens and a **Done** button appears (the toolbar steps aside
  while you type). Tap an existing text to edit it, and use **A− / A+** and the colour dots in the bar to change the size
  and colour of that text. The middle button shows the size in points (like Word: 9, 11, 12 ...); tap it to pick a size
  from a list. You can also resize with a finger: drag the round handle under the text (right / down = bigger), or
  pinch on the text with two fingers. Taps in a row are one undo step. Tap somewhere else to finish.
- **Open files from other apps**: tap a PDF, Word or PowerPoint file in Telegram, Files, WhatsApp or Gmail and choose
  **Inkwell** in the "Open with" list. The file is imported and opened. Opening the same file again brings back your
  existing notebook with its notes instead of making a copy. (Needs the updated APK; Android lists the app after install.)
- Word and PowerPoint files imported with an older version have no text to select: import them again.
  Scanned PDFs and pictures contain no text, so they cannot be selected.
- **Folders**: the folder button in the library creates a folder (also inside folders). Long-press a notebook to select
  several, then **Move to…**. The ⋮ menu of a folder renames, moves or deletes it (notebooks inside are kept).

## Use it without installing (web version)

Everything in the `www` folder is a normal web app. Host the folder anywhere that serves HTTPS (for example GitHub Pages),
open it in Chrome on your phone, and choose **Add to Home screen**.

## What is supported

| Feature | Notes |
|---|---|
| PDF | Full page rendering (text, images, vector), password-protected PDFs, text selection |
| Word (.docx) | Text styles, headings, bullet/numbered lists, tables, pictures, right-to-left Arabic. Pages are laid out to Word's page size, so page breaks can differ slightly from Word |
| PowerPoint (.pptx) | Text, shapes, pictures, tables, backgrounds, themes. Charts and SmartArt show as a grey placeholder; animations are ignored |
| Old .doc / .ppt | Not supported — open in Word/PowerPoint and Save As .docx / .pptx first |
| Export | Whole notebook as PDF (with your notes), or one page as a PNG |

---

# إنكويل — تطبيق ملاحظات مجاني لملفات PDF وWord وPowerPoint

افتح ملفات PDF وWord (‎.docx) وPowerPoint (‎.pptx) واكتب عليها بالقلم وقلم التمييز والممحاة والنصوص والأشكال.
**جديد: تحديد النص ونسخه، وتمييز الكلمات أو تسطيرها أو شطبها، وتنظيم الملفات في مجلدات.**
كل شيء يُحفظ على هاتفك. الواجهة بالإنجليزية والعربية.

## الحصول على ملف APK (مجاني، حوالي 10 دقائق، بدون Android Studio)

تحتاج حساب GitHub مجاني. يكفي الهاتف: افتح github.com في Chrome وفعّل **موقع سطح المكتب** من قائمة ⋮.

1. أنشئ مستودعاً (**+ ← New repository**) وسمِّه `inkwell`.
2. ارفع الملف **`Inkwell-Android-Project.zip`** كما هو (**Add file ← Upload files**) دون فك ضغطه.
3. **Add file ← Create new file**، اكتب الاسم `.github/workflows/build-apk.yml` وانسخ إليه محتوى الملف
   `build-apk.workflow.yml` (موجود داخل الملف المضغوط) ثم **Commit changes**.
4. افتح تبويب **Actions**؛ يبدأ البناء تلقائياً (أو اضغط **Run workflow**). انتظر 5–10 دقائق حتى تظهر علامة ✓ الخضراء.
5. نزّل الـAPK من:
   - **Releases** (على يمين الصفحة الرئيسية للمستودع) ← أحدث *Inkwell build* ← اضغط **app-debug.apk**.
   - أو من عملية التشغيل المكتملة ← **Artifacts** ← *Inkwell-APK* (ملف مضغوط فيه `app-debug.apk`).
6. افتح الملف على الهاتف واسمح بالتثبيت من هذا المصدر إذا طلب أندرويد ذلك.

إن فشل البناء (علامة ✗ حمراء) انسخ آخر 30 سطراً من سجل الخطوة الفاشلة (أو صوّر الشاشة) وأرسلها لي.

### تحديث التطبيق لاحقاً
ارفع ملف `Inkwell-Android-Project.zip` الجديد إلى المستودع نفسه (بنفس الاسم ليحلّ محل القديم) فيبدأ بناء جديد.
كل نسخة موقّعة بالمفتاح نفسه (`signing/debug.keystore`) ولها رقم إصدار أعلى، لذلك تُثبَّت فوق النسخة القديمة وتبقى ملفاتك.
(فقط أول نسخة صُنعت قبل هذا المفتاح يجب حذفها مرة واحدة؛ صدّر ما تحتاجه بصيغة PDF قبل ذلك.)

## استخدام الميزات الجديدة

- **تحديد النص**: اختر أداة المؤشر I واضغط على كلمة، أو اضغط مطولاً واسحب عبر الكلمات. حرّك المقبضين الدائريين لتغيير التحديد.
  يعرض الشريط: **نسخ**، وأربعة ألوان للتمييز، و**تسطير**، و**شطب** (التسطير والشطب بلون القلم الحالي). اضغط على كلمة مميّزة
  لتظهر أيقونة سلة تزيل التمييز. التراجع والممحاة يعملان على التمييز أيضاً.
- **القلم الذكي** (مفعّل افتراضياً، ويمكن إيقافه من الإعدادات): تُنعَّم خطوط القلم، والخط الذي رسمته مستقيماً تقريباً يصبح مستقيماً
  (ويثبت أفقياً أو عمودياً تماماً إذا كان قريباً من ذلك). و**قلم التمييز يلتصق بالنص**: اسحبه فوق الكلمات حتى لو كان الخط مائلاً قليلاً
  أو خرج عن السطر فيتحوّل إلى تمييز مرتّب لتلك الكلمات بالضبط (الكلمات التي لمستها بالكاد لا تدخل). وفوق الصور أو المساحات الفارغة
  يبقى خط تمييز نظيفاً. التراجع والممحاة يعملان عليه كالمعتاد. في الصفحات الممسوحة ضوئياً لا يوجد نص، فتحصل على خط ناعم ومستقيم.
- **أداة النص**: اضغط حيث تريد الكتابة فتفتح لوحة المفاتيح ويظهر زر **تم** (ويختفي شريط الأدوات أثناء الكتابة). اضغط على نص موجود
  لتعديله، واستخدم **A− / A+** ونقاط الألوان في الشريط لتغيير حجم ذلك النص ولونه. الزر الأوسط يعرض الحجم بالنقاط (مثل Word: ‎9 و11 و12‎...)؛
  اضغط عليه لاختيار حجم من قائمة. ويمكنك أيضاً تغيير الحجم بإصبعك: اسحب الدائرة تحت النص (يميناً أو لأسفل = أكبر)،
  أو اقرص على النص بإصبعين. اضغط في مكان آخر للإنهاء.
- **فتح الملفات من تطبيقات أخرى**: اضغط على ملف PDF أو Word أو PowerPoint في تيليجرام أو الملفات أو واتساب أو Gmail
  واختر **Inkwell** من قائمة «فتح باستخدام». يُستورد الملف ويُفتح. وإذا فتحت الملف نفسه مرة أخرى يعود دفترك السابق بملاحظاته
  بدل إنشاء نسخة جديدة. (يتطلب النسخة المحدّثة من التطبيق.)
- ملفات Word وPowerPoint المستوردة بإصدار أقدم لا تحتوي نصاً قابلاً للتحديد: أعد استيرادها.
  أما ملفات PDF الممسوحة ضوئياً والصور فلا تحتوي نصاً.
- **المجلدات**: زر المجلد في المكتبة ينشئ مجلداً (وداخل المجلدات أيضاً). اضغط مطولاً على ملف لتحديد عدة ملفات ثم **نقل إلى…**.
  قائمة ⋮ للمجلد تتيح إعادة التسمية أو النقل أو الحذف (الملفات داخله تبقى).

## ملاحظات

- ملفات ‎.doc و‎.ppt القديمة غير مدعومة: افتحها في Word/PowerPoint واحفظها بصيغة ‎.docx / ‎.pptx.
- في ملفات PowerPoint تظهر المخططات وSmartArt كمربع رمادي، ولا تُشغَّل الحركات.
