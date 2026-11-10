// =====================================================================
//  STEP 1: Paste your Firebase web app config here.
//  Firebase Console -> Project settings -> General -> Your apps -> Web app
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyB63gShl0WUEdmWEMEDQJibiZjhpEXaMS0",
  authDomain: "lakhipur-polyclinic.firebaseapp.com",
  projectId: "lakhipur-polyclinic",
  storageBucket: "lakhipur-polyclinic.firebasestorage.app",
  messagingSenderId: "1016599049231",
  appId: "1:1016599049231:web:e0a7edb7f4a94bd96b5f7a"
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
