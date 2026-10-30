// Where the app keeps its data (products, orders, customers, sessions, backups)
// and uploaded product photos.
//
// Locally these default to the project folders, so nothing changes for testing.
// On a host with a persistent volume you have three ways to point at it:
//   • STORAGE_DIR=/storage        — one folder holding both (data in /storage/data, photos in /storage/uploads)
//   • DATA_DIR=...  UPLOAD_DIR=... — exact folders, e.g. to keep using an EXISTING volume without moving anything
// DATA_DIR / UPLOAD_DIR win over STORAGE_DIR if both are set.
const path = require('path');

const { STORAGE_DIR, DATA_DIR: DATA_ENV, UPLOAD_DIR: UPLOAD_ENV } = process.env;

const DATA_DIR = DATA_ENV
  ? path.resolve(DATA_ENV)
  : STORAGE_DIR ? path.join(STORAGE_DIR, 'data') : path.join(__dirname, 'data');

const UPLOAD_DIR = UPLOAD_ENV
  ? path.resolve(UPLOAD_ENV)
  : STORAGE_DIR ? path.join(STORAGE_DIR, 'uploads') : path.join(__dirname, 'public', 'uploads');

module.exports = { STORAGE_DIR, DATA_DIR, UPLOAD_DIR };
