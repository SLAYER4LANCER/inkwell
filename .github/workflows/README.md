# Inkwell — free notes app for PDF, Word and PowerPoint

Open PDF, Word (.docx) and PowerPoint (.pptx) files and write on them: pen, highlighter, eraser,
text boxes, shapes, extra pages, undo/redo. Everything is stored on your phone. English and Arabic.

## Get the APK (free, about 10 minutes, no Android Studio needed)

You need a computer (or a phone browser in "Desktop site" mode) and a free GitHub account.

1. Unzip this folder.
2. Sign in at <https://github.com> and click **New repository**. Name it `inkwell`, then **Create repository**.
3. On the new repository page click **uploading an existing file**. Drag in **everything inside the
   unzipped folder** (including the `.github` folder) and press **Commit changes**. Do not upload the .zip itself —
   GitHub does not open zip files. The project is 79 files, which fits in one upload (the limit is 100).
   - If the `.github` folder did not upload: click **Add file → Create new file**, type the name
     `.github/workflows/build-apk.yml`, paste the contents of `build-apk.workflow.yml`, and commit.
4. Open the **Actions** tab → **Build Android APK** → **Run workflow**. Wait 5–10 minutes for the green check.
5. Open the finished run, scroll to **Artifacts**, download **Inkwell-APK**, unzip it, and you have `app-debug.apk`.
6. Copy the APK to your phone and open it. Android will ask you to allow installing from this source — allow it.

If the build fails (red X), open the failed step, copy the last 30 lines of the log and send them to me.

## Use it without installing (web version)

Everything in the `www` folder is a normal web app. Host the folder anywhere that serves HTTPS
(for example GitHub Pages), open it in Chrome on your phone, and choose **Add to Home screen**.

## What is supported

| Feature | Notes |
|---|---|
| PDF | Full page rendering (text, images, vector), password-protected PDFs |
| Word (.docx) | Text styles, headings, bullet/numbered lists, tables, pictures, right-to-left Arabic. Pages are laid out to Word's page size, so page breaks can differ slightly from Word |
| PowerPoint (.pptx) | Text, shapes, pictures, tables, backgrounds, themes. Charts and SmartArt show as a grey placeholder; animations are ignored |
| Old .doc / .ppt | Not supported — open in Word/PowerPoint and Save As .docx / .pptx first |
| Export | Whole notebook as PDF (with your notes), or one page as a PNG |

---

# إنكويل — تطبيق ملاحظات مجاني لملفات PDF وWord وPowerPoint

افتح ملفات PDF وWord (‎.docx) وPowerPoint (‎.pptx) واكتب عليها بالقلم وقلم التمييز والممحاة والنصوص والأشكال.
كل شيء يُحفظ على هاتفك. الواجهة بالإنجليزية والعربية.

## الحصول على ملف APK (مجاني، حوالي 10 دقائق، بدون Android Studio)

تحتاج حاسوباً (أو متصفح الهاتف بوضع "موقع سطح المكتب") وحساب GitHub مجاني.

1. فك ضغط هذا المجلد.
2. سجّل الدخول في <https://github.com> واضغط **New repository**، سمِّه `inkwell` ثم **Create repository**.
3. في صفحة المستودع اضغط **uploading an existing file**، واسحب **كل محتويات المجلد** (بما فيها مجلد `.github`) ثم **Commit changes**.
   - إن لم يُرفع مجلد `.github`: اضغط **Add file ← Create new file**، اكتب الاسم `.github/workflows/build-apk.yml`
     وانسخ إليه محتوى الملف `build-apk.workflow.yml` ثم احفظ.
4. افتح تبويب **Actions** ← **Build Android APK** ← **Run workflow**، وانتظر 5–10 دقائق حتى تظهر علامة ✓ الخضراء.
5. افتح عملية التشغيل المكتملة، وفي قسم **Artifacts** نزّل **Inkwell-APK** ثم فك ضغطه لتحصل على `app-debug.apk`.
6. انقل الملف إلى هاتفك وافتحه، واسمح بالتثبيت من هذا المصدر عندما يطلب أندرويد ذلك.

إن فشل البناء (علامة ✗ حمراء) انسخ آخر 30 سطراً من سجل الخطوة الفاشلة وأرسلها لي.

## ملاحظات

- ملفات ‎.doc و‎.ppt القديمة غير مدعومة: افتحها في Word/PowerPoint واحفظها بصيغة ‎.docx / ‎.pptx.
- في ملفات PowerPoint تظهر المخططات وSmartArt كمربع رمادي، ولا تُشغَّل الحركات.
