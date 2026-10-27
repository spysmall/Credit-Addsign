/**
 * Firebase project "mm-credit-addsign": Google sign-in (Auth) and the shared request store (Firestore).
 * This config is public by design — access is enforced by firestore.rules, not by hiding it.
 */
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQmJXDLBcsIciI3LqFE0PYkqprnKFxJ8c",
  authDomain: "mm-credit-addsign.firebaseapp.com",
  projectId: "mm-credit-addsign",
  storageBucket: "mm-credit-addsign.firebasestorage.app",
  messagingSenderId: "51727053182",
  appId: "1:51727053182:web:6c3eee2857984844ddc32f",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
