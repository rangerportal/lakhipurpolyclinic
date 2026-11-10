// =====================================================================
//  STEP 1: Paste your Firebase web app config here.
//  Firebase Console -> Project settings -> General -> Your apps -> Web app
// =====================================================================
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Usernames are turned into login emails like  username@lakhipurpolyclinic.app
// (no real email is ever sent). If you change this, also change it in firestore.rules.
export const LOGIN_DOMAIN = "lakhipurpolyclinic.app";

// The main admin username. The admin account is created automatically
// the very first time someone logs in as "admin".
export const ADMIN_USERNAME = "admin";

// Default clinic details (admin can edit these later in Settings).
export const DEFAULT_SETTINGS = {
  name: "Lakhipur Polyclinic",
  address: "Amolapatty Road, Near Lakhipur Sub Divisional Civil Hospital, Lakhipur, Goalpara, Assam, India",
  phone: "",
  email: "",
  timings: "",
  tagline: "",          // e.g. "Caring for Lakhipur since 2010"
  tags: "",             // e.g. "OPD • Diagnostics • Pharmacy • Emergency"
  logo: "",             // uploaded from Settings (stored as an image inside the database)
  footerNote: "Please bring this prescription on your next visit.",
  paperSize: "A5"
};
