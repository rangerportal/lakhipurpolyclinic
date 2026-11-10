# Lakhipur Polyclinic — Clinic Management App (PWA)

A web app you can install on phones, tablets and computers. Data is stored in your Firebase project.

## Who can do what

| Feature | Admin | Co-partner | Staff |
|---|:-:|:-:|:-:|
| Create prescription + collect fee, print | ✔ | – | ✔ |
| Add / edit patients | ✔ | view | ✔ |
| Search prescriptions & patients | ✔ | ✔ | ✔ |
| Dashboard: earnings, doctor-wise, payment mode, who collected | ✔ | ✔ | – |
| Export reports to Excel (CSV) | ✔ | ✔ | – |
| Add / edit / remove doctors (with degrees, fee, doctor share %) | ✔ | view | view |
| Cancel a wrong entry (with reason) | ✔ | – | – |
| Create unlimited co-partner / staff logins, disable them | ✔ | – | – |
| Clinic settings, full backup | ✔ | – | – |

**Admin login:** username `admin`, password `BabuAhmed@1122`.
The password is not stored in the code. The admin account is created in Firebase the first time you log in with it. **Log in as admin right after you deploy**, before anyone else opens the link.

---

## Setup (about 15 minutes, one time)

### 1. Create a Firebase project
1. Go to https://console.firebase.google.com and click **Add project**. Name it something like `lakhipur-polyclinic`. You can turn off Google Analytics.
2. On the project home page, click the **Web** icon (`</>`) to add a web app. Give it a name and click **Register app**.
3. You will see a `firebaseConfig = { ... }` block. Copy the values into **`firebase-config.js`**, replacing the placeholder values.

### 2. Turn on login
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**

### 3. Create the database
1. **Build → Firestore Database → Create database.** Pick location **asia-south1 (Mumbai)** and start in **production mode**.
2. Open the **Rules** tab, delete everything there, paste in the whole of **`firestore.rules`**, and click **Publish**.

### 4. Put the app online (Firebase Hosting, free)
On a computer with [Node.js](https://nodejs.org) installed, open a terminal in this folder and run:
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy
```
It prints a link like `https://lakhipur-polyclinic.web.app`. That is your app.

> Prefer not to use the terminal? You can upload this folder to any static host (for example Netlify Drop). In that case, still paste the rules from step 3 in the Firebase console.
> Then go to **Authentication → Settings → Authorized domains** and add your host's domain.

### 5. First login
1. Open the link and log in with `admin` / `BabuAhmed@1122`.
2. **Settings:** add the clinic phone number and timings.
3. **Doctors:** add each doctor with their degrees, fee and doctor share %.
4. **Logins:** create the 3 co-partner and 2 staff logins (you can add more at any time). Share each username and password with that person.

### 6. Add your logo
**Settings → Upload logo**, then fill in the tagline and the services line (e.g. `OPD • Diagnostics • Pharmacy`) and press **Save settings**. They appear on the login screen, in the menu, and on every prescription and receipt.

### 7. Install on each device
- **Android (Chrome):** open the link, then tap the menu (⋮) → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** tap Share → **Add to Home Screen**.
- **Computer (Chrome/Edge):** click the install icon in the address bar.

---

## Daily use (staff)
1. **New Prescription** → pick the doctor → search for the patient by phone or name (or tap **New patient**).
2. Enter vitals if you have them, check the fee, then press **Save & Print**.
3. The prescription prints on A5 paper with your logo, clinic name, tagline, the doctor's name and degrees, the token number and patient details. Most of the page is a blank ℞ area for the doctor to write on. **No fee is printed on the prescription.** You can choose A4 in Settings.
4. If the patient wants a fee receipt, press **Print fee receipt** on the same screen.

## Screen layouts
- **Desktop / laptop (wider than 1100px):** full side menu.
- **Tablet (761–1100px):** a slim icon menu, so forms and tables get the full width. Inputs are larger for touch.
- **Mobile (760px or less):** top bar plus a bottom tab bar (Home, New Rx, Entries, Patients, More). Tables turn into cards and pop-ups slide up from the bottom.

The app switches layout on its own based on screen size, so one link works on every device.

Patient IDs (`LPC00001`), receipt numbers (`R000001`) and daily tokens for each doctor are numbered automatically.

## Good to know
- **Password forgotten (staff/partner):** the admin disables the old login and creates a new one with a different username. Anyone can change their own password under **My Account**.
- **Internet:** saving a new prescription needs internet, because it uses the auto-numbers. Lists you have already opened still show when the device is offline.
- **Backup:** Settings → Download full backup, once a month.
- **Changing the login domain:** if you change `LOGIN_DOMAIN` in `firebase-config.js`, also change the admin email in `firestore.rules`.
- **Upgrading from the first version:** paste the new `firestore.rules` into the console again and Publish. The login screen needs it to show your logo.
- **Updates:** after you change any file, increase `CACHE = "lpc-v1"` in `sw.js` (for example to `lpc-v2`) and deploy again.
