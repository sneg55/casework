// Fallback narrator: macOS `say` instead of OpenAI TTS, for when no API key is available.
// Writes the same out/audio/<id>.mp3 files build-video.mjs expects, with the same hash-sidecar
// cache, so swapping back to tts.mjs later only re-synthesizes what actually changed.
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenes.json'), 'utf8'))
const OUT = path.join(__dirname, 'out', 'audio')
fs.mkdirSync(OUT, { recursive: true })

const VOICE = process.env.SAY_VOICE || 'Samantha'
const RATE = process.env.SAY_RATE || '172'
const hash = (t) => crypto.createHash('sha256').update(`say|${VOICE}|${RATE}|${t}`).digest('hex').slice(0, 16)

for (const scene of scenes) {
  const mp3 = path.join(OUT, `${scene.id}.mp3`)
  const stamp = path.join(OUT, `${scene.id}.hash`)
  const want = hash(scene.narrate)
  if (fs.existsSync(mp3) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want) {
    console.log(`  ${scene.id} cached`)
    continue
  }
  const aiff = path.join(OUT, `${scene.id}.aiff`)
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, scene.narrate])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3])
  fs.unlinkSync(aiff)
  fs.writeFileSync(stamp, want)
  console.log(`  ${scene.id} -> ${path.relative(__dirname, mp3)}`)
}
