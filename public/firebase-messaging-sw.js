// Firebase messaging SW — delegates to the universal push handler.
// This file exists so any existing SW registrations for firebase-messaging-sw.js
// still work. All actual push handling is in push-sw.js.

importScripts('/push-sw.js');
