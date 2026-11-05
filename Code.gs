/**
 * =========================================================================
 * ระบบยืม-คืนอุปกรณ์ภายในองค์กร (Equipment Borrowing & Return System)
 * Google Apps Script Backend (Code.gs)
 * =========================================================================
 */

// --- ค่าคงที่ชื่อชีตและคอลัมน์ ---
const SHEET_ITEMS = 'Items';
const SHEET_TRANSACTIONS = 'Transactions';
const SHEET_SETTINGS = 'Settings';

/**
 * ฟังก์ชันหลักสำหรับเปิด Web App
 */
function doGet(e) {
  initDatabase();
  
  // ป้องกันปัญหาตัวพิมพ์เล็ก-ใหญ่ (Index / index / Index.html)
  var template;
  try {
    template = HtmlService.createTemplateFromFile('Index');
  } catch (err1) {
    try {
      template = HtmlService.createTemplateFromFile('index');
    } catch (err2) {
      template = HtmlService.createTemplateFromFile('Index.html');
    }
  }

  // โหลดข้อมูลอุปกรณ์ส่งตรงเข้า HTML ทันที (Server-Side Preload) เพื่อให้หน้าเว็บเปิดแล้วแสดงผลทันทีโดยไม่ต้องหมุนรอ
  try {
    var initialData = getInitialData();
    template.serverData = JSON.stringify(initialData);
  } catch (err) {
    Logger.log('Error preloading data in doGet: ' + err.toString());
    template.serverData = JSON.stringify({
      items: [],
      categories: [],
      currentUserEmail: '',
      isAdmin: false,
      settings: {}
    });
  }

  return template
    .evaluate()
    .setTitle('ระบบยืม-คืนอุปกรณ์ | Equipment Borrowing System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ดึงไฟล์ย่อยมา include ใน HTML (ถ้าต้องการแยกไฟล์)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 1. ตรวจสอบและตั้งค่าฐานข้อมูลบน Google Sheets อัตโนมัติ (Database Initializer)
 */
function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1.1 ชีต Items
  let sheetItems = ss.getSheetByName(SHEET_ITEMS);
  if (!sheetItems) {
    sheetItems = ss.insertSheet(SHEET_ITEMS);
    const headers = [
      'Item_ID', 'Item_Name', 'Category', 'Status', 'Serial_No', 'Image_URL', 'Remarks'
    ];
    sheetItems.appendRow(headers);
    formatHeaderRow(sheetItems, '#1E40AF'); // สีน้ำเงิน Indigo
    
    // ข้อมูลเริ่มต้นสำหรับทดสอบระบบ
    const sampleItems = [
      ['IT-001', 'MacBook Pro 14" (M3 Pro)', 'คอมพิวเตอร์และโน้ตบุ๊ก', 'Available', 'SN-MBP14-202401', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80', 'RAM 18GB, SSD 512GB อุปกรณ์พร้อม Adapter'],
      ['IT-002', 'Dell XPS 15 9530', 'คอมพิวเตอร์และโน้ตบุ๊ก', 'Available', 'SN-DELL-9530-88', 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80', 'Core i7, RAM 32GB พร้อมกระเป๋าใส่'],
      ['AV-001', 'Sony Alpha 7 IV (Body)', 'กล้องและสตูดิโอ', 'Available', 'SN-SONY-A7M4-09', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80', 'แบตเตอรี่ 2 ก้อน + สายชาร์จ Type-C'],
      ['AV-002', 'Rode Wireless PRO Microphone', 'ระบบเสียง', 'Available', 'SN-RODE-WPRO-44', 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=600&q=80', 'ชุดไมค์ลอยคู่ พร้อมกล่องชาร์จ'],
      ['PR-001', 'Epson EB-FH52 Full HD Projector', 'โปรเจกเตอร์และจอภาพ', 'Available', 'SN-EPSON-FH52-12', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80', 'ความสว่าง 4,000 Lumens พร้อมสาย HDMI 5 เมตร'],
      ['TL-001', 'ชุดเครื่องมือช่างเครือข่าย Network Toolkit', 'อุปกรณ์ช่างและเครื่องมือวัด', 'Available', 'SN-NET-TL-01', 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=600&q=80', 'คีมเข้าหัว LAN, เครื่องทดสอบสาย Cable Tester']
    ];
    sampleItems.forEach(row => sheetItems.appendRow(row));
    sheetItems.autoResizeColumns(1, headers.length);
  }

  // 1.2 ชีต Transactions
  let sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!sheetTxn) {
    sheetTxn = ss.insertSheet(SHEET_TRANSACTIONS);
    const headers = [
      'Transaction_ID', 'Item_ID', 'Item_Name', 'Borrower_Name', 'Borrower_Email', 
      'Department', 'Borrow_Type', 'Borrow_Date', 'Expected_Return_Date', 
      'Actual_Return_Date', 'Status', 'Reminder_Sent_Count', 'Admin_Notes'
    ];
    sheetTxn.appendRow(headers);
    formatHeaderRow(sheetTxn, '#047857'); // สีเขียว Emerald
    sheetTxn.autoResizeColumns(1, headers.length);
  }

  // 1.3 ชีต Settings
  let sheetSettings = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheetSettings) {
    sheetSettings = ss.insertSheet(SHEET_SETTINGS);
    const headers = ['Setting_Key', 'Setting_Value', 'Description'];
    sheetSettings.appendRow(headers);
    formatHeaderRow(sheetSettings, '#4B5563'); // สีเทาเข้ม
    
    const userEmail = Session.getActiveUser().getEmail() || 'admin@example.com';
    const defaultSettings = [
      ['Admin_Emails', userEmail, 'อีเมลผู้ดูแลระบบ คั่นด้วยเครื่องหมายจุลภาค (,)'],
      ['Reminder_Days_Before', '1', 'ส่งแจ้งเตือนล่วงหน้ากี่วันก่อนถึงกำหนดส่งคืน (วัน)'],
      ['Organization_Name', 'Smart Equipment Center', 'ชื่อองค์กรหรือฝ่ายผู้ดูแลอุปกรณ์'],
      ['Email_Header', 'ระบบยืม-คืนอุปกรณ์ส่วนกลาง', 'หัวข้อจดหมายและส่วนหัวอีเมล'],
      ['Contact_Info', 'โทร. 02-123-4567 ต่อ 8899 | อีเมล it-support@example.com', 'ข้อมูลติดต่อฝ่ายพัสดุ/ผู้ดูแล']
    ];
    defaultSettings.forEach(row => sheetSettings.appendRow(row));
    sheetSettings.autoResizeColumns(1, headers.length);
  }
}

/**
 * ฟังก์ชันช่วยจัดรูปแบบ Header แถวแรกของชีต
 */
function formatHeaderRow(sheet, bgColor) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground(bgColor)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontFamily('Prompt')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
}

/**
 * อ่านค่าการตั้งค่าจากชีต Settings ออกมาเป็น Object
 */
function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return {};
  
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]).trim();
    const val = data[i][1];
    if (key) {
      settings[key] = val;
    }
  }
  return settings;
}

/**
 * ดึงข้อมูลเบื้องต้นสำหรับแสดงผลบนเว็บ (โหลดครั้งเดียวตอนเปิดหน้าเว็บ)
 */
function getInitialData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log('ActiveSpreadsheet is null');
      return { items: [], categories: [], currentUserEmail: '', isAdmin: false, settings: {} };
    }
    
    if (!ss.getSheetByName(SHEET_ITEMS) || !ss.getSheetByName(SHEET_TRANSACTIONS) || !ss.getSheetByName(SHEET_SETTINGS)) {
      initDatabase();
    }
    
    // 1. อ่านรายการอุปกรณ์
    const sheetItems = ss.getSheetByName(SHEET_ITEMS);
    const items = [];
    const categoriesSet = new Set();
    
    if (sheetItems) {
      const itemsData = sheetItems.getDataRange().getValues();
      for (let i = 1; i < itemsData.length; i++) {
        const row = itemsData[i];
        if (!row[0]) continue;
        const item = {
          itemId: String(row[0]),
          itemName: String(row[1] || ''),
          category: String(row[2] || 'ทั่วไป'),
          status: String(row[3] || 'Available'),
          serialNo: String(row[4] || ''),
          imageUrl: String(row[5] || ''),
          remarks: String(row[6] || '')
        };
        items.push(item);
        if (item.category) categoriesSet.add(item.category);
      }
    }
    
    // 2. ข้อมูลผู้ใช้งานปัจจุบันและสิทธิ์แอดมิน
    let currentUserEmail = '';
    try {
      currentUserEmail = Session.getActiveUser().getEmail() || '';
    } catch (e) {
      Logger.log('Session getActiveUser error: ' + e);
    }
    
    let settings = {};
    try {
      settings = getSettings();
    } catch (e) {
      Logger.log('getSettings error: ' + e);
    }
    
    const adminEmails = String(settings.Admin_Emails || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    
    const isAdmin = currentUserEmail ? adminEmails.includes(currentUserEmail.toLowerCase()) : false;
    
    // โหลดรายการธุรกรรมสำหรับแท็บติดตามสถานะ (เปิดให้ทุกคนดูได้)
    const trackingTransactions = getTrackingTransactions();
    
    return {
      items: items,
      categories: Array.from(categoriesSet),
      currentUserEmail: currentUserEmail,
      isAdmin: isAdmin,
      trackingTransactions: trackingTransactions,
      settings: {
        organizationName: String(settings.Organization_Name || 'ระบบยืม-คืนอุปกรณ์'),
        emailHeader: String(settings.Email_Header || 'ระบบยืม-คืนอุปกรณ์ส่วนกลาง'),
        contactInfo: String(settings.Contact_Info || ''),
        reminderDaysBefore: Number(settings.Reminder_Days_Before || 1)
      }
    };
  } catch (err) {
    Logger.log('Fatal error in getInitialData: ' + err.toString());
    return { items: [], categories: [], currentUserEmail: '', isAdmin: false, settings: {} };
  }
}

/**
 * 2. บันทึกคำขอยืมอุปกรณ์ (Borrow Submission with Concurrency Lock)
 */
function submitBorrowRequest(formData) {
  // ใช้ Lock ป้องกันผู้ใช้กดยืมอุปกรณ์ตัวเดียวกันพร้อมกัน
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // รอได้สูงสุด 10 วินาที
  } catch (e) {
    return {
      success: false,
      message: 'มีผู้ใช้งานระบบจำนวนมาก กรุณาลองใหม่อีกครั้งในอีกสักครู่'
    };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetItems = ss.getSheetByName(SHEET_ITEMS);
    const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
    
    const itemId = String(formData.itemId).trim();
    const borrowerName = String(formData.borrowerName).trim();
    const borrowerEmail = String(formData.borrowerEmail).trim();
    const department = String(formData.department).trim();
    const borrowType = String(formData.borrowType).trim();
    const borrowDateStr = String(formData.borrowDate).trim();
    const expectedReturnDateStr = String(formData.expectedReturnDate).trim();
    const userNotes = String(formData.userNotes || '').trim();

    if (!itemId || !borrowerName || !borrowerEmail || !expectedReturnDateStr) {
      return { success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' };
    }

    // ตรวจสอบสถานะอุปกรณ์ในชีต Items อีกครั้ง
    const itemsData = sheetItems.getDataRange().getValues();
    let itemRowIndex = -1;
    let currentItem = null;

    for (let i = 1; i < itemsData.length; i++) {
      if (String(itemsData[i][0]).trim() === itemId) {
        itemRowIndex = i + 1; // 1-based index
        currentItem = {
          itemId: itemsData[i][0],
          itemName: itemsData[i][1],
          category: itemsData[i][2],
          status: itemsData[i][3],
          serialNo: itemsData[i][4],
          imageUrl: itemsData[i][5]
        };
        break;
      }
    }

    if (!currentItem) {
      return { success: false, message: 'ไม่พบอุปกรณ์ที่ระบุในระบบ' };
    }

    if (currentItem.status !== 'Available') {
      return { 
        success: false, 
        message: `ขออภัย อุปกรณ์นี้ไม่พร้อมให้ยืมในขณะนี้ (สถานะปัจจุบัน: ${currentItem.status})` 
      };
    }

    // สร้าง Transaction ID รูปแบบ TXN-YYYYMMDD-XXXX
    const now = new Date();
    const dateCode = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transactionId = `TXN-${dateCode}-${randomSuffix}`;

    // 1. เพิ่มรายการลงในชีต Transactions
    const newTxnRow = [
      transactionId,
      currentItem.itemId,
      currentItem.itemName,
      borrowerName,
      borrowerEmail,
      department,
      borrowType,
      borrowDateStr,
      expectedReturnDateStr,
      '',           // Actual_Return_Date
      'Pending',    // Status เริ่มต้นเป็น "Pending" (รอจัดเตรียม / ตรวจสอบ)
      0,            // Reminder_Sent_Count
      userNotes     // Admin_Notes
    ];
    sheetTxn.appendRow(newTxnRow);

    // 2. อัปเดตสถานะของอุปกรณ์ในชีต Items เป็น "Borrowed" เพื่อป้องกันการยืมซ้อน
    sheetItems.getRange(itemRowIndex, 4).setValue('Borrowed');

    // 3. ส่งอีเมลยืนยันการยืมทันที
    const settings = getSettings();
    sendBorrowConfirmationEmail({
      transactionId: transactionId,
      borrowerName: borrowerName,
      borrowerEmail: borrowerEmail,
      department: department,
      item: currentItem,
      borrowType: borrowType,
      borrowDate: borrowDateStr,
      expectedReturnDate: expectedReturnDateStr,
      settings: settings
    });

    return {
      success: true,
      transactionId: transactionId,
      message: 'บันทึกการขอยืมสำเร็จ! ได้ส่งอีเมลยืนยันไปยัง ' + borrowerEmail + ' เรียบร้อยแล้ว'
    };

  } catch (error) {
    Logger.log('Error in submitBorrowRequest: ' + error.toString());
    return { success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 3. ส่งอีเมลยืนยันการทำรายการขอยืมอุปกรณ์ (Instant Confirmation Email)
 */
function sendBorrowConfirmationEmail(data) {
  try {
    const orgName = data.settings.Organization_Name || 'ระบบยืม-คืนอุปกรณ์';
    const subject = `[ยืนยันการยืมอุปกรณ์] ${data.item.itemName} (รหัส: ${data.transactionId})`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 28px 24px; text-align: center; }
          .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: bold; }
          .header p { margin: 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 24px; }
          .badge { display: inline-block; background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
          .detail-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; font-weight: 500; }
          .detail-val { color: #0f172a; font-weight: 600; text-align: right; }
          .alert-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-top: 20px; font-size: 13px; color: #92400e; }
          .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${orgName}</h1>
            <p>บันทึกการทำรายการยืมอุปกรณ์สำเร็จ</p>
          </div>
          <div class="content">
            <span class="badge">รหัสอ้างอิง: ${data.transactionId}</span>
            <p style="font-size: 15px; margin-top: 0;">
              เรียน คุณ <strong>${data.borrowerName}</strong> (${data.department})
            </p>
            <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
              ระบบได้รับการบันทึกข้อมูลการยืมอุปกรณ์ของท่านเรียบร้อยแล้ว โดยมีรายละเอียดดังต่อไปนี้:
            </p>

            <div class="detail-box">
              <div class="detail-row">
                <span class="detail-label">อุปกรณ์ที่ยืม:</span>
                <span class="detail-val">${data.item.itemName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">รหัสทรัพย์สิน / Serial:</span>
                <span class="detail-val">${data.item.serialNo || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">หมวดหมู่:</span>
                <span class="detail-val">${data.item.category}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">ประเภทการใช้งาน:</span>
                <span class="detail-val">${data.borrowType}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">วันที่และเวลายืม:</span>
                <span class="detail-val">${formatDisplayDate(data.borrowDate)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label" style="color: #dc2626;">กำหนดส่งคืน (Due Date):</span>
                <span class="detail-val" style="color: #dc2626; font-size: 15px;">${formatDisplayDate(data.expectedReturnDate)}</span>
              </div>
            </div>

            <div class="alert-box">
              <strong>ข้อปฏิบัติในการใช้งาน:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                <li>กรุณาดูแลรักษาอุปกรณ์ให้อยู่ในสภาพสมบูรณ์พร้อมใช้งานตลอดระยะเวลาที่ยืม</li>
                <li>หากพบปัญหาหรือการชำรุดเสียหาย โปรดแจ้งเจ้าหน้าที่ทันที</li>
                <li>กรุณานำส่งคืนตามกำหนดเวลาเพื่อให้เพื่อนร่วมงานสามารถใช้งานต่อได้</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">อีเมลนี้เป็นข้อความอัตโนมัติจากระบบ ไม่ต้องตอบกลับ</p>
            <p style="margin: 4px 0 0 0;">${data.settings.Contact_Info || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: data.borrowerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (err) {
    Logger.log('Error sending borrow confirmation email: ' + err.toString());
  }
}

/**
 * ส่งอีเมลยืนยันการรับคืนอุปกรณ์ (Return Receipt Confirmation)
 */
function sendReturnConfirmationEmail(data) {
  try {
    const orgName = data.settings.Organization_Name || 'ระบบยืม-คืนอุปกรณ์';
    const subject = `[ยืนยันการรับคืนอุปกรณ์] ${data.itemName} (รหัส: ${data.transactionId})`;
    const formattedReturnDate = formatDisplayDate(data.returnTimestamp);
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669, #047857); color: #ffffff; padding: 28px 24px; text-align: center; }
          .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: bold; }
          .header p { margin: 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 24px; }
          .badge { display: inline-block; background-color: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
          .success-message { background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px; font-size: 15px; color: #065f46; font-weight: 600; }
          .detail-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; font-weight: 500; }
          .detail-val { color: #0f172a; font-weight: 600; text-align: right; }
          .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${orgName}</h1>
            <p>บันทึกการส่งคืนอุปกรณ์สำเร็จ</p>
          </div>
          <div class="content">
            <span class="badge">รหัสอ้างอิง: ${data.transactionId}</span>
            <p style="font-size: 15px; margin-top: 0;">
              เรียน คุณ <strong>${data.borrowerName}</strong>
            </p>
            
            <div class="success-message">
              ✓ เจ้าหน้าที่ IT ได้รับอุปกรณ์ที่ท่านคืนไปเรียบร้อยแล้ว
            </div>

            <div class="detail-box">
              <div class="detail-row">
                <span class="detail-label">อุปกรณ์ที่ส่งคืน:</span>
                <span class="detail-val">${data.itemName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">รหัสอุปกรณ์:</span>
                <span class="detail-val">${data.itemId || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label" style="color: #059669;">วันที่และเวลาที่รับคืน:</span>
                <span class="detail-val" style="color: #059669; font-size: 15px;">${formattedReturnDate} น.</span>
              </div>
              ${data.adminNotes ? `
              <div class="detail-row">
                <span class="detail-label">บันทึกสภาพ / หมายเหตุ:</span>
                <span class="detail-val">${data.adminNotes}</span>
              </div>` : ''}
              <div class="detail-row">
                <span class="detail-label">สถานะการทำรายการ:</span>
                <span class="detail-val" style="color: #059669;">ส่งคืนเสร็จสมบูรณ์ (Returned)</span>
              </div>
            </div>

            <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
              ขอขอบคุณที่ให้ความร่วมมือในการส่งคืนอุปกรณ์ตามระเบียบขององค์กร หากมีข้อสงสัยหรือต้องการสอบถามเพิ่มเติม สามารถติดต่อเจ้าหน้าที่ได้ตามข้อมูลด้านล่าง
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">อีเมลนี้เป็นข้อความอัตโนมัติจากระบบ ไม่ต้องตอบกลับ</p>
            <p style="margin: 4px 0 0 0;">${data.settings.Contact_Info || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: data.borrowerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    Logger.log(`Sent return confirmation email to ${data.borrowerEmail} for txn ${data.transactionId}`);
  } catch (err) {
    Logger.log('Error sending return confirmation email: ' + err.toString());
  }
}

/**
 * ส่งอีเมลแจ้งเตือนผู้ยืมว่าอุปกรณ์พร้อมให้มารับแล้ว (Pickup Ready Email)
 */
function sendPickupReadyEmail(data) {
  try {
    const orgName = data.settings.Organization_Name || 'ระบบยืม-คืนอุปกรณ์';
    const subject = `[แจ้งพร้อมรับอุปกรณ์] ${data.itemName} (รหัส: ${data.transactionId})`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 28px 24px; text-align: center; }
          .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: bold; }
          .header p { margin: 0; opacity: 0.9; font-size: 14px; }
          .content { padding: 24px; }
          .badge { display: inline-block; background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
          .pickup-box { background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 10px; padding: 18px; margin: 16px 0; text-align: center; }
          .pickup-title { font-size: 13px; color: #1e40af; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
          .pickup-room { font-size: 20px; color: #1e3a8a; font-weight: bold; }
          .detail-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #64748b; font-weight: 500; }
          .detail-val { color: #0f172a; font-weight: 600; text-align: right; }
          .alert-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-top: 20px; font-size: 13px; color: #92400e; }
          .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${orgName}</h1>
            <p>แจ้งเตือนพร้อมรับอุปกรณ์</p>
          </div>
          <div class="content">
            <span class="badge">รหัสอ้างอิง: ${data.transactionId}</span>
            <p style="font-size: 15px; margin-top: 0;">
              เรียน คุณ <strong>${data.borrowerName}</strong>
            </p>
            <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
              คำขอยืมอุปกรณ์ของท่านได้รับการจัดเตรียมเรียบร้อยแล้ว ท่านสามารถเดินทางมารับเครื่องอุปกรณ์ได้ตามสถานที่ดังต่อไปนี้:
            </p>

            <div class="pickup-box">
              <div class="pickup-title">📍 สถานที่ / ห้องสำหรับรับอุปกรณ์</div>
              <div class="pickup-room">${data.pickupLocation || 'ห้อง IT Support ส่วนกลาง'}</div>
            </div>

            <div class="detail-box">
              <div class="detail-row">
                <span class="detail-label">อุปกรณ์:</span>
                <span class="detail-val">${data.itemName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">รหัสทรัพย์สิน:</span>
                <span class="detail-val">${data.itemId || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">วันที่ขอยืม:</span>
                <span class="detail-val">${data.borrowDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label" style="color: #dc2626;">กำหนดส่งคืน:</span>
                <span class="detail-val" style="color: #dc2626; font-size: 15px;">${data.expectedReturnDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">สถานะปัจจุบัน:</span>
                <span class="detail-val" style="color: #2563eb;">พร้อมรับอุปกรณ์ (Ready for Pickup)</span>
              </div>
            </div>

            <div class="alert-box">
              <strong>ข้อแนะนำในการรับอุปกรณ์:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                <li>กรุณาแสดงอีเมลนี้หรือแจ้งรหัส <strong>${data.transactionId}</strong> ต่อเจ้าหน้าที่</li>
                <li>กรุณาตรวจสอบอุปกรณ์และสายชาร์จ/อุปกรณ์ต่อพ่วงก่อนนำออกจากห้อง</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">อีเมลนี้เป็นข้อความอัตโนมัติจากระบบ ไม่ต้องตอบกลับ</p>
            <p style="margin: 4px 0 0 0;">${data.settings.Contact_Info || ''}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: data.borrowerEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    Logger.log(`Sent pickup ready email to ${data.borrowerEmail} for txn ${data.transactionId}`);
  } catch (err) {
    Logger.log('Error sending pickup ready email: ' + err.toString());
  }
}

/**
 * ดึงรายการธุรกรรมสำหรับแท็บติดตามสถานะ (เปิดให้ทุกคนเข้าดูได้ เรียงจากใหม่ไปเก่า)
 */
function getTrackingTransactions() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return [];
    const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
    if (!sheetTxn) return [];
    
    const data = sheetTxn.getDataRange().getValues();
    const transactions = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      
      const adminNote = String(row[12] || '');
      let pickupLocation = '';
      if (adminNote.indexOf('สถานที่รับเครื่อง:') !== -1) {
        const parts = adminNote.split('สถานที่รับเครื่อง:');
        if (parts.length > 1) {
          pickupLocation = parts[1].split('|')[0].trim();
        }
      }
      
      transactions.push({
        transactionId: String(row[0]),
        itemId: String(row[1]),
        itemName: String(row[2]),
        borrowerName: String(row[3]),
        borrowerEmail: String(row[4]),
        department: String(row[5]),
        borrowType: String(row[6]),
        borrowDate: formatDisplayDate(row[7]),
        expectedReturnDate: formatDisplayDate(row[8]),
        actualReturnDate: row[9] ? formatDisplayDate(row[9]) : '-',
        status: String(row[10] || 'Pending'),
        reminderSentCount: Number(row[11] || 0),
        pickupLocation: pickupLocation,
        adminNotes: adminNote
      });
    }
    
    return transactions.reverse();
  } catch (err) {
    Logger.log('Error in getTrackingTransactions: ' + err.toString());
    return [];
  }
}

/**
 * 4. หน้าต่าง UI ฝั่ง Admin: ดึงรายการประวัติ Transactions ทั้งหมด
 */
function adminGetTransactions() {
  return getTrackingTransactions();
}

/**
 * ฟังก์ชัน Admin: เปลี่ยนสถานะเป็น "พร้อมรับเครื่อง (Ready)" + ระบุห้อง + ส่งอีเมลแจ้งผู้ยืม
 */
function adminSetReadyForPickup(transactionId, pickupLocation) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'ระบบกำลังประมวลผล กรุณาลองใหม่อีกครั้ง' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
    if (!sheetTxn) return { success: false, message: 'ไม่พบชีต Transactions' };

    const txnData = sheetTxn.getDataRange().getValues();
    let txnRowIndex = -1;
    let itemId = '';
    let itemName = '';
    let borrowerName = '';
    let borrowerEmail = '';
    let borrowDate = '';
    let expectedReturnDate = '';
    let currentNotes = '';

    const targetTxnId = String(transactionId || '').trim().toUpperCase();
    for (let i = 1; i < txnData.length; i++) {
      if (String(txnData[i][0]).trim().toUpperCase() === targetTxnId) {
        txnRowIndex = i + 1;
        itemId = String(txnData[i][1]).trim();
        itemName = String(txnData[i][2]);
        borrowerName = String(txnData[i][3]);
        borrowerEmail = String(txnData[i][4]);
        borrowDate = formatDisplayDate(txnData[i][7]);
        expectedReturnDate = formatDisplayDate(txnData[i][8]);
        currentNotes = String(txnData[i][12] || '');
        break;
      }
    }

    if (txnRowIndex === -1) {
      return { success: false, message: 'ไม่พบรหัสรายการ ' + transactionId };
    }

    const cleanLocation = String(pickupLocation || '').trim();

    // อัปเดต Status เป็น 'Ready'
    sheetTxn.getRange(txnRowIndex, 11).setValue('Ready');

    // บันทึกสถานที่รับเครื่องใน Admin_Notes
    let updatedNotes = currentNotes;
    if (updatedNotes.indexOf('สถานที่รับเครื่อง:') !== -1) {
      updatedNotes = updatedNotes.replace(/สถานที่รับเครื่อง:[^|]+/, 'สถานที่รับเครื่อง: ' + cleanLocation);
    } else {
      updatedNotes = updatedNotes ? (updatedNotes + ' | สถานที่รับเครื่อง: ' + cleanLocation) : ('สถานที่รับเครื่อง: ' + cleanLocation);
    }
    sheetTxn.getRange(txnRowIndex, 13).setValue(updatedNotes);

    SpreadsheetApp.flush();

    // ส่งอีเมลแจ้งเตือนผู้ยืมทันที
    if (borrowerEmail) {
      const settings = getSettings();
      sendPickupReadyEmail({
        transactionId: targetTxnId,
        itemName: itemName,
        itemId: itemId,
        borrowerName: borrowerName,
        borrowerEmail: borrowerEmail,
        pickupLocation: cleanLocation,
        borrowDate: borrowDate,
        expectedReturnDate: expectedReturnDate,
        settings: settings
      });
    }

    return {
      success: true,
      message: 'ปรับสถานะเป็น "พร้อมรับอุปกรณ์" และส่งอีเมลแจ้งไปยัง ' + borrowerEmail + ' เรียบร้อยแล้ว'
    };
  } catch (err) {
    Logger.log('Error in adminSetReadyForPickup: ' + err.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ฟังก์ชัน Admin: ยืนยันการส่งมอบเครื่อง (เปลี่ยนสถานะเป็น Active - กำลังยืม)
 */
function adminMarkPickedUp(transactionId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'ระบบกำลังประมวลผล กรุณาลองใหม่อีกครั้ง' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
    if (!sheetTxn) return { success: false, message: 'ไม่พบชีต Transactions' };

    const txnData = sheetTxn.getDataRange().getValues();
    let txnRowIndex = -1;
    let itemName = '';

    const targetTxnId = String(transactionId || '').trim().toUpperCase();
    for (let i = 1; i < txnData.length; i++) {
      if (String(txnData[i][0]).trim().toUpperCase() === targetTxnId) {
        txnRowIndex = i + 1;
        itemName = String(txnData[i][2]);
        break;
      }
    }

    if (txnRowIndex === -1) {
      return { success: false, message: 'ไม่พบรหัสรายการ ' + transactionId };
    }

    sheetTxn.getRange(txnRowIndex, 11).setValue('Active');
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'ยืนยันการส่งมอบอุปกรณ์ ' + itemName + ' สำเร็จ สถานะเปลี่ยนเป็น "กำลังยืม (Active)"'
    };
  } catch (err) {
    Logger.log('Error in adminMarkPickedUp: ' + err.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 5. ฟังก์ชัน Admin: บันทึกการส่งคืนอุปกรณ์ (Return Confirmation)
 */
function adminReturnItem(transactionId, adminNotes) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: 'ระบบกำลังประมวลผล กรุณาลองใหม่อีกครั้ง' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
    const sheetItems = ss.getSheetByName(SHEET_ITEMS);
    
    if (!sheetTxn || !sheetItems) {
      return { success: false, message: 'ไม่พบชีต Transactions หรือ Items ใน Google Sheets' };
    }
    
    const txnData = sheetTxn.getDataRange().getValues();
    let txnRowIndex = -1;
    let itemIdToReturn = null;
    let borrowerEmail = '';
    let borrowerName = '';
    let itemName = '';
    
    const targetTxnId = String(transactionId || '').trim().toUpperCase();
    for (let i = 1; i < txnData.length; i++) {
      if (String(txnData[i][0]).trim().toUpperCase() === targetTxnId) {
        txnRowIndex = i + 1;
        itemIdToReturn = String(txnData[i][1]).trim();
        itemName = txnData[i][2];
        borrowerName = txnData[i][3];
        borrowerEmail = txnData[i][4];
        break;
      }
    }
    
    if (txnRowIndex === -1) {
      return { success: false, message: 'ไม่พบรหัสรายการ ' + transactionId + ' ในฐานข้อมูล' };
    }
    
    const now = new Date();
    const returnTimestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    
    // อัปเดตชีต Transactions: Actual_Return_Date (Col 10), Status (Col 11), Admin_Notes (Col 13)
    sheetTxn.getRange(txnRowIndex, 10).setValue(returnTimestamp);
    sheetTxn.getRange(txnRowIndex, 11).setValue('Returned');
    if (adminNotes) {
      const currentNote = sheetTxn.getRange(txnRowIndex, 13).getValue();
      const updatedNote = currentNote ? `${currentNote} | บันทึกคืน: ${adminNotes}` : `บันทึกคืน: ${adminNotes}`;
      sheetTxn.getRange(txnRowIndex, 13).setValue(updatedNote);
    }
    
    // อัปเดตชีต Items: ปรับสถานะอุปกรณ์กลับมาเป็น "Available"
    if (itemIdToReturn) {
      const itemsData = sheetItems.getDataRange().getValues();
      for (let j = 1; j < itemsData.length; j++) {
        if (String(itemsData[j][0]).trim().toUpperCase() === itemIdToReturn.toUpperCase()) {
          sheetItems.getRange(j + 1, 4).setValue('Available');
          break;
        }
      }
    }
    
    // บังคับบันทึกการเปลี่ยนแปลงลง Google Sheets ทันที (ป้องกัน Delay/Cache)
    SpreadsheetApp.flush();
    
    // ส่งอีเมลยืนยันการรับคืนอุปกรณ์ไปยังผู้ยืม
    if (borrowerEmail) {
      try {
        const settings = getSettings();
        sendReturnConfirmationEmail({
          transactionId: targetTxnId,
          itemName: itemName,
          itemId: itemIdToReturn,
          borrowerName: borrowerName,
          borrowerEmail: borrowerEmail,
          returnTimestamp: returnTimestamp,
          adminNotes: adminNotes || '',
          settings: settings
        });
      } catch (mailErr) {
        Logger.log('Error triggering return confirmation email: ' + mailErr.toString());
      }
    }
    
    return {
      success: true,
      message: `บันทึกการส่งคืน ${itemName} (${transactionId}) เรียบร้อยแล้ว สถานะอุปกรณ์ถูกปรับเป็น "พร้อมใช้งาน (Available)"`
    };
  } catch (err) {
    Logger.log('Error in adminReturnItem: ' + err.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 6. ฟังก์ชัน Admin: เพิ่มหรือแก้ไขข้อมูลอุปกรณ์ (Save / Edit Item)
 */
function adminSaveItem(itemData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetItems = ss.getSheetByName(SHEET_ITEMS);
  const data = sheetItems.getDataRange().getValues();
  
  let targetRow = -1;
  const isEdit = Boolean(itemData.isEdit);
  
  if (isEdit) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(itemData.itemId).trim()) {
        targetRow = i + 1;
        break;
      }
    }
    if (targetRow === -1) {
      return { success: false, message: 'ไม่พบอุปกรณ์ที่ต้องการแก้ไข' };
    }
    
    sheetItems.getRange(targetRow, 2).setValue(itemData.itemName);
    sheetItems.getRange(targetRow, 3).setValue(itemData.category);
    sheetItems.getRange(targetRow, 4).setValue(itemData.status);
    sheetItems.getRange(targetRow, 5).setValue(itemData.serialNo || '');
    sheetItems.getRange(targetRow, 6).setValue(itemData.imageUrl || '');
    sheetItems.getRange(targetRow, 7).setValue(itemData.remarks || '');
    
    return { success: true, message: 'แก้ไขข้อมูลอุปกรณ์เรียบร้อยแล้ว' };
  } else {
    // สร้าง Item ID ใหม่อัตโนมัติหากไม่ได้กรอกมา
    let newItemId = itemData.itemId ? String(itemData.itemId).trim() : '';
    if (!newItemId) {
      const prefix = (itemData.category || 'EQ').substring(0, 2).toUpperCase();
      const count = data.length;
      newItemId = `${prefix}-${String(count).padStart(3, '0')}`;
    }
    
    sheetItems.appendRow([
      newItemId,
      itemData.itemName,
      itemData.category,
      itemData.status || 'Available',
      itemData.serialNo || '',
      itemData.imageUrl || '',
      itemData.remarks || ''
    ]);
    
    return { success: true, message: 'เพิ่มอุปกรณ์ใหม่เข้าสู่ระบบเรียบร้อยแล้ว' };
  }
}

/**
 * 7. ฟังก์ชัน Admin: ปรับสถานะอุปกรณ์แบบรวดเร็ว (เช่น ส่งซ่อมบำรุง / กลับมาพร้อมใช้)
 */
function adminUpdateItemStatus(itemId, newStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetItems = ss.getSheetByName(SHEET_ITEMS);
  const data = sheetItems.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(itemId).trim()) {
      sheetItems.getRange(i + 1, 4).setValue(newStatus);
      return { success: true, message: `อัปเดตสถานะอุปกรณ์ ${itemId} เป็น "${newStatus}" เรียบร้อยแล้ว` };
    }
  }
  return { success: false, message: 'ไม่พบอุปกรณ์ที่ระบุ' };
}

/**
 * 8. ระบบแจ้งเตือนทางอีเมลอัตโนมัติ (Daily Trigger: checkAndSendReminders)
 * ตรวจสอบรายการที่ใกล้ครบกำหนด (ล่วงหน้า 1 วัน) และรายการที่เกินกำหนดคืน
 */
function checkAndSendReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetTxn = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!sheetTxn) return 'Sheet Transactions not found';
  
  const settings = getSettings();
  const reminderDaysBefore = Number(settings.Reminder_Days_Before) || 1;
  const adminEmails = settings.Admin_Emails || '';
  const orgName = settings.Organization_Name || 'ระบบยืม-คืนอุปกรณ์';
  
  const txnData = sheetTxn.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // ตัดเวลาทิ้งเพื่อเทียบแค่วันที่
  
  let remindersSent = 0;
  let overdueCount = 0;
  
  for (let i = 1; i < txnData.length; i++) {
    const status = String(txnData[i][10]).trim();
    if (status !== 'Active' && status !== 'Overdue') {
      continue; // ข้ามรายการที่คืนแล้ว
    }
    
    const txnId = txnData[i][0];
    const itemName = txnData[i][2];
    const borrowerName = txnData[i][3];
    const borrowerEmail = txnData[i][4];
    const expectedReturnRaw = txnData[i][8];
    const reminderCount = Number(txnData[i][11] || 0);
    
    if (!expectedReturnRaw || !borrowerEmail) continue;
    
    const dueDate = new Date(expectedReturnRaw);
    if (isNaN(dueDate.getTime())) continue;
    
    const dueDateClean = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const diffTime = dueDateClean.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    // เคสที่ 1: ใกล้ครบกำหนดคืน (เช่น อีก 1 วัน หรือตรงกับวันกำหนดคืน)
    if (diffDays >= 0 && diffDays <= reminderDaysBefore) {
      const subject = `[แจ้งเตือนใกล้ครบกำหนดคืน] ${itemName} (กำหนดคืน: ${formatDisplayDate(dueDate)})`;
      const htmlBody = generateReminderEmailHtml({
        type: 'DUE_SOON',
        orgName: orgName,
        borrowerName: borrowerName,
        itemName: itemName,
        txnId: txnId,
        dueDateStr: formatDisplayDate(expectedReturnRaw),
        diffDays: diffDays,
        contactInfo: settings.Contact_Info || ''
      });
      
      try {
        MailApp.sendEmail({
          to: borrowerEmail,
          cc: adminEmails,
          subject: subject,
          htmlBody: htmlBody
        });
        
        // บันทึกจำนวนครั้งที่ส่งแจ้งเตือน
        sheetTxn.getRange(i + 1, 12).setValue(reminderCount + 1);
        remindersSent++;
      } catch (err) {
        Logger.log(`Failed to send reminder to ${borrowerEmail}: ${err.toString()}`);
      }
    } 
    // เคสที่ 2: เกินกำหนดส่งคืนแล้ว (Overdue)
    else if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      const subject = `[แจ้งเตือนเกินกำหนดคืน! ด่วน] ${itemName} (เกินกำหนด ${overdueDays} วัน)`;
      const htmlBody = generateReminderEmailHtml({
        type: 'OVERDUE',
        orgName: orgName,
        borrowerName: borrowerName,
        itemName: itemName,
        txnId: txnId,
        dueDateStr: formatDisplayDate(expectedReturnRaw),
        diffDays: overdueDays,
        contactInfo: settings.Contact_Info || ''
      });
      
      try {
        MailApp.sendEmail({
          to: borrowerEmail,
          cc: adminEmails,
          subject: subject,
          htmlBody: htmlBody
        });
        
        // ปรับสถานะในชีตเป็น Overdue
        sheetTxn.getRange(i + 1, 11).setValue('Overdue');
        sheetTxn.getRange(i + 1, 12).setValue(reminderCount + 1);
        overdueCount++;
      } catch (err) {
        Logger.log(`Failed to send overdue alert to ${borrowerEmail}: ${err.toString()}`);
      }
    }
  }
  
  const summaryMsg = `ตรวจเช็คเรียบร้อย: ส่งเตือนใกล้ครบกำหนด ${remindersSent} รายการ, แจ้งเตือนเกินกำหนด ${overdueCount} รายการ`;
  Logger.log(summaryMsg);
  return summaryMsg;
}

/**
 * สร้าง HTML Template สำหรับอีเมลแจ้งเตือน
 */
function generateReminderEmailHtml(data) {
  const isOverdue = data.type === 'OVERDUE';
  const headerBg = isOverdue ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #f59e0b, #d97706)';
  const badgeColor = isOverdue ? '#fee2e2' : '#fef3c7';
  const badgeTextColor = isOverdue ? '#991b1b' : '#92400e';
  const statusTitle = isOverdue ? 'แจ้งเตือนอุปกรณ์เกินกำหนดส่งคืน' : 'แจ้งเตือนใกล้ถึงกำหนดส่งคืนอุปกรณ์';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: ${headerBg}; color: #ffffff; padding: 26px 20px; text-align: center; }
        .content { padding: 24px; }
        .badge { display: inline-block; background-color: ${badgeColor}; color: ${badgeTextColor}; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: bold; margin-bottom: 16px; }
        .box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 18px 0; }
        .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0; font-size: 20px;">${data.orgName}</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.95;">${statusTitle}</p>
        </div>
        <div class="content">
          <div style="text-align: center;">
            <span class="badge">รหัสรายการ: ${data.txnId}</span>
          </div>
          <p>เรียน คุณ <strong>${data.borrowerName}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">
            ${isOverdue 
              ? `<span style="color: #dc2626; font-weight: bold;">ขณะนี้อุปกรณ์ที่ท่านยืมได้เลยกำหนดส่งคืนแล้วเป็นเวลา ${data.diffDays} วัน</span> ขอความกรุณานำอุปกรณ์มาส่งคืนที่ฝ่ายดูแลอุปกรณ์โดยเร็วที่สุด เพื่อไม่ให้ส่งผลกระทบต่อผู้รอใช้งานลำดับถัดไป`
              : `ขอแจ้งเตือนว่าอุปกรณ์ที่ท่านยืม <span style="color: #d97706; font-weight: bold;">ใกล้จะถึงกำหนดส่งคืนในเร็วๆ นี้</span> กรุณาเตรียมนำส่งคืนตามวันและเวลาที่กำหนด`}
          </p>
          <div class="box">
            <p style="margin: 4px 0;"><strong>ชื่ออุปกรณ์:</strong> ${data.itemName}</p>
            <p style="margin: 4px 0;"><strong>กำหนดส่งคืน:</strong> <span style="color: ${isOverdue ? '#dc2626' : '#d97706'}; font-weight: bold;">${data.dueDateStr}</span></p>
          </div>
          <p style="font-size: 13px; color: #64748b;">
            * หากท่านได้ดำเนินการส่งคืนอุปกรณ์แล้ว หรือมีเหตุจำเป็นต้องขอขยายระยะเวลา โปรดติดต่อเจ้าหน้าที่ดูแลอุปกรณ์ทันที
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0;">${data.contactInfo}</p>
          <p style="margin: 4px 0 0 0;">ข้อความอัตโนมัติจาก Google Apps Script</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 9. ฟังก์ชันช่วยสร้างและลบ Time-driven Trigger อัตโนมัติ (รันทุกวัน 08:00 - 09:00 น.)
 */
function setupDailyReminderTrigger() {
  removeDailyReminderTrigger(); // ลบอันเดิมทิ้งก่อนเพื่อป้องกัน trigger ซ้ำซ้อน
  
  ScriptApp.newTrigger('checkAndSendReminders')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .create();
    
  return 'ติดตั้ง Trigger ตรวจสอบและส่งอีเมลแจ้งเตือนทุกวันเวลา 08:00 น. เรียบร้อยแล้ว';
}

function removeDailyReminderTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  return 'ลบ Trigger เดิมออกเรียบร้อยแล้ว';
}

/**
 * ฟังก์ชันช่วยแปลงและจัดรูปแบบวันที่ให้แสดงผลเข้าใจง่าย (ภาษาไทย)
 */
function formatDisplayDate(dateInput) {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  } catch (e) {
    return String(dateInput);
  }
}
