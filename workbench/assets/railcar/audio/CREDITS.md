# Gramophone music

`gramophone.mp3` was supplied by Heather, who confirmed on October 18, 2026 that she
owns it or holds a license to publish it. This track and its browser horn filtering/hiss
are preserved from Claude's music update.

# Selected sound recordings

Heather selected these Freesound recordings on October 18, 2026. Sources are the site's
high-quality MP3 previews, transcoded to 128 kbps MP3 for delivery (not the original WAVs).
Listed excerpt times refer to the source recording. Playback gains are adjusted in the app.
The globe recording is CC BY-NC 4.0: attribution and NONCOMMERCIAL use only. The poker is
CC BY 4.0 and requires attribution. The other selected effects are CC0.

- **safe-dial** — [Bank Vault Combination Lock Sound - V6](https://freesound.org/people/Pixeliota/sounds/678254/) by **Pixeliota**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: full recording, transcoded; playback volume adjusted. Delivered as `safe-dial.mp3`.
- **safe-door** — [safe deposit box door open close squeak various lock unlock.flac](https://freesound.org/people/kyles/sounds/362052/) by **kyles**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: 32–33 seconds, transcoded; playback volume adjusted. Delivered as `safe-door.mp3`.
- **globe** — [SpinningGlobeSound1](https://freesound.org/people/TunaBombs/sounds/848502/) by **TunaBombs**; [license](https://creativecommons.org/licenses/by-nc/4.0/). Changes: full recording, transcoded; playback volume adjusted. Delivered as `globe.mp3`.
- **lamp** — [lamp switch.wav](https://freesound.org/people/Swoboman87/sounds/108459/) by **Swoboman87**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: 2.9–3.1 seconds, transcoded; playback volume adjusted. Delivered as `lamp.mp3`.
- **cigar** — [smoking4.wav](https://freesound.org/people/lmr9/sounds/265361/) by **lmr9**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: full recording, transcoded; playback volume adjusted. Delivered as `cigar.mp3`.
- **weight** — [Clink3.wav](https://freesound.org/people/BMacZero/sounds/96136/) by **BMacZero**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: full recording, transcoded; playback volume adjusted. Delivered as `weight.mp3`.
- **fire** — [fire_crackling.wav](https://freesound.org/people/ceich93/sounds/263864/) by **ceich93**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: full recording, transcoded; playback volume adjusted. Delivered as `fire.mp3`.
- **poker** — [FIRESizz_Fire Poker Stirring The Coals 01_KVV AUDIO_FREE](https://freesound.org/people/KVV_Audio/sounds/784222/) by **KVV_Audio**; [license](https://creativecommons.org/licenses/by/4.0/). Changes: 0–3 seconds, transcoded; playback volume adjusted. Delivered as `poker.mp3`.
- **train** — [Steam Train Interior.MP3](https://freesound.org/people/allh/sounds/133099/) by **allh**; [license](http://creativecommons.org/publicdomain/zero/1.0/). Changes: 0–40 seconds, transcoded; playback volume adjusted. Delivered as `train.mp3`.

The fireplace uses its full 59.960-second recording as a loop. Train ambience loops exactly
the first 40 seconds. Poker uses the first 3 seconds, while the visual fire boost still lasts
7 seconds. This credit does not assign a license to the repository as a whole.

## October18 audio refinement

- Globe: source848502 now starts at0.700s and runs to its end (~1.994s). Spin timing follows it.
- Weights: source96136 playback pitch increases as mass decreases:0,+2,+4,+6,+8 semitones.
- Cigar: source265361 spectrally denoised using its recorded room-tone profile;80Hz highpass,
  quiet padding smoothly suppressed before0.7s/after3.7s;50ms edge fades. Full5.25s duration retained.
- Train: same0–40s excerpt; now defaults ON after the first gesture, shares the master Sound
  control/context, and has a separate ambience toggle. Playback volume raised.
- Jewelry boxes: [Metal object sliding on wood surface](https://freesound.org/people/dynamique/sounds/368654/)
  by **dynamique**, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), excerpt8.58–9.77s,
  transcoded to128kbps MP3. Used for opening and closing both cantilever cases; volume adjusted.

## Clock recordings (October19)

Door: FOSSarts761919, CC0, opening0–1.5s / closing2.3–2.8s. Winding: day-garwood619296, CC BY3.0, full clip. Ticking: urbaneguerilla161443, CC BY-NC4.0,4–44s loop. Half-hour melody: DiArchangeli458592, CC0,4s to end. Exact source URLs, durations and hashes are in effects.json. HQ MP3 preview sources re-encoded128kbps; three-millisecond decoded edge ramps in the player. Noncommercial restriction retained.

Clock playback level calibration: the unmodified ticking excerpt measures -60dBFS
mean/-39dBFS peak; playback compensates it by34dB before distance attenuation and
the master bus. The quiet opening and chime excerpts also have playback gain
adjustments. Source files, requested excerpts, durations and pitch are unchanged.
