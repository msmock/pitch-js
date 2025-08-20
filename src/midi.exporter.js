import pkg from '@tonejs/midi';
const {Midi} = pkg;

/**
 *
 */
export class MidiExporter {

  constructor(bpm = 120, instrument = 25, timeSignature = [4, 4]) {
    this.bpm = bpm;
    this.instrument = instrument; //25 Acoustic Guitar (nylon)
    this.timeSignature = timeSignature;
  }

  /**
   * Create the midi data from the timed note events
   *
   * @param notes
   * @returns {Uint8Array}
   */
  generateMidi(notes) {

    const midi = new Midi();

    // set the tempo
    midi.header.setTempo(this.bpm);

    // the time signature
    midi.header.timeSignatures.push({
      ticks: 0,
      timeSignature: this.timeSignature,
    });

    // track with instrument
    const track = midi.addTrack();
    track.instrument.number = this.instrument;

    notes.forEach((note) => {
      track.addNote({
        midi: note.pitchMidi,
        time: note.startTimeSeconds,
        duration: note.durationSeconds,
        velocity: note.amplitude,
      });

      if (note.pitchBends !== undefined && note.pitchBends !== null) {
        note.pitchBends.forEach((bend, i) => {
          track.addPitchBend({
            time:
              note.startTimeSeconds +
              (i * note.durationSeconds) / note.pitchBends.length,
            value: bend,
          });
        });
      }
    });
    return midi.toArray();
  }
}
