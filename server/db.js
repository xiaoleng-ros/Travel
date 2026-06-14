const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, 'data', 'db.json')

const defaultDb = {
  users: [
    {
      id: 1,
      username: 'admin',
      password: '$2a$10$XQ1Y5xG7z8y9a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x', // admin123
      nickname: '管理员',
    },
  ],
  albums: [],
  photos: [],
}

let db = null

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    }
  } catch {}
  if (!db || !db.users || !db.albums || !db.photos) {
    db = JSON.parse(JSON.stringify(defaultDb))
    save()
  }
  return db
}

function save() {
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

load()

function getUsers() { return db.users }
function getAlbums() { return db.albums }
function getPhotos() { return db.photos }

function findAlbum(id) { return db.albums.find(a => a.id === id) }
function findPhoto(id) { return db.photos.find(p => p.id === id) }

function addAlbum(album) {
  album.id = Date.now()
  db.albums.push(album)
  save()
  return album
}

function updateAlbum(id, data) {
  const idx = db.albums.findIndex(a => a.id === id)
  if (idx === -1) return null
  db.albums[idx] = { ...db.albums[idx], ...data }
  save()
  return db.albums[idx]
}

function deleteAlbum(id) {
  db.albums = db.albums.filter(a => a.id !== id)
  // also delete photos in this album
  const deletedPhotos = db.photos.filter(p => p.album_id === id)
  db.photos = db.photos.filter(p => p.album_id !== id)
  save()
  return deletedPhotos
}

function addPhoto(photo) {
  photo.id = Date.now() + Math.random()
  db.photos.push(photo)
  save()
  return photo
}

function addPhotos(photos) {
  const added = []
  for (const p of photos) {
    p.id = Date.now() + Math.random()
    db.photos.push(p)
    added.push(p)
  }
  save()
  return added
}

function deletePhoto(id) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1) return null
  const [photo] = db.photos.splice(idx, 1)
  save()
  return photo
}

function getPhotosByAlbum(albumId) {
  return db.photos.filter(p => p.album_id === albumId)
}

function getAllPhotos() {
  return db.photos
}

module.exports = {
  getUsers,
  getAlbums,
  getPhotos,
  findAlbum,
  findPhoto,
  addAlbum,
  updateAlbum,
  deleteAlbum,
  addPhoto,
  addPhotos,
  deletePhoto,
  getPhotosByAlbum,
  getAllPhotos,
  save,
}
