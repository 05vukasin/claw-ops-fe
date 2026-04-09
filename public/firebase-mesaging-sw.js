// Typo-compat shim.
// Some clients may register /firebase-mesaging-sw.js (missing "s").
// Delegate to the canonical Firebase messaging service worker entry.

importScripts('/firebase-messaging-sw.js');
