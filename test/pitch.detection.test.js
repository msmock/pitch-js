import * as tf from '@tensorflow/tfjs';
import fs from 'fs';

import { AudioContext } from 'web-audio-api';
import { BasicPitch } from '../src/inference.js';

import {
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from '../src/toMidi.js';

import pkg from '@tonejs/midi';
const { Midi } = pkg;

import * as tfnode from '@tensorflow/tfjs-node';

/**
 * Write the pitch detection results to file as json and midi
 *
 * @param {*} namePrefix the filename prefix
 * @param {*} notes
 * @param {*} noMelodiaNotes
 */
function writeDebugOutput(namePrefix, notes, noMelodiaNotes) {

  // write the JSON files
  fs.writeFileSync(`${namePrefix}.json`, JSON.stringify(notes));
  fs.writeFileSync(`${namePrefix}.nomelodia.json`, JSON.stringify(noMelodiaNotes));

  // create midi track
  const midi = new Midi();
  const trackWithMelodia = midi.addTrack();
  trackWithMelodia.name = namePrefix;

  notes.forEach((note) => {

    trackWithMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });

    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) =>
        trackWithMelodia.addPitchBend({
          time:
            note.startTimeSeconds +
            (note.durationSeconds * i) / note.pitchBends.length,
          value: b,
        })
      );
    }
  });

  const trackNoMelodia = midi.addTrack();
  trackNoMelodia.name = `${namePrefix}.nomelodia`;

  noMelodiaNotes.forEach((note) => {

    trackNoMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });

    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) =>
        trackWithMelodia.addPitchBend({
          time:
            note.startTimeSeconds +
            (note.durationSeconds * i) / note.pitchBends.length,
          value: b,
        })
      );
    }
  });

  // write the midi track
  fs.writeFileSync(`${namePrefix}.mid`, midi.toArray());
}

/**
 *
 */
async function runTest() {

  const modelFile = process.cwd() + '/model/model.json';
  const fileToPitch = process.cwd() + '/test/test-input/C_major.resampled.mp3';

  // load the model
  console.log('Load model from file ' + modelFile);
  const model = tf.loadGraphModel('file://' + modelFile);

  // the auido file to pitch
  const clip = fs.readFileSync(fileToPitch);

  // decode the audio file
  const audioCtx = new AudioContext();
  audioCtx.decodeAudioData(clip, whenDecoded, () => console.log('Error during decoding of ' + fileToPitch));

  /**
   * 
   * @param {*} audioBuffer 
   */
  async function whenDecoded(audioBuffer) {

    // TODO resample down to 22050
    console.log('Run Basic Pitch with audio ' + fileToPitch);
    console.log('AudioBuffer has sampleRate ' + audioBuffer.sampleRate + ', ' +
      audioBuffer.numberOfChannels + ' channel ' + ', buffer length ' + audioBuffer.length +
      ', duration ' + audioBuffer.duration);

    // run the basic pitch
    const frames = []; // frames where a note is active
    const onsets = []; // the first few frames of every note
    const contours = []; // the estimated phrases (of a voice)

    let pct = 0;
    const basicPitch = new BasicPitch(model);

    await basicPitch.evaluateModel(
      audioBuffer,
      (f, o, c) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (p) => {
        pct = p;
      }
    );

    console.log('pct is = ' + pct);

    const onsetThresh = 0.25;
    const frameThresh = 0.25;
    const minNoteLength = 5;

    //
    const poly = noteFramesToTime(
      addPitchBendsToNoteEvents(
        contours,
        outputToNotesPoly(frames, onsets, onsetThresh, frameThresh, minNoteLength)
      )
    );

    const inferOnsets = true;
    const maxFreq = null;
    const minFreq = null;
    const melodiaTrick = false;

    // const energyTolerance not used
    const polyNoMelodia = noteFramesToTime(
      addPitchBendsToNoteEvents(
        contours,
        outputToNotesPoly(
          frames,
          onsets,
          onsetThresh,
          frameThresh,
          minNoteLength,
          inferOnsets,
          maxFreq,
          minFreq,
          melodiaTrick
        )
      )
    );

    // write json output
    const jsonOutputFile = process.cwd() + '/test/test-output/pith.detection.test';
    writeDebugOutput(jsonOutputFile, poly, polyNoMelodia);

    console.log('Finished pitch detection of file ' + fileToPitch);
  }
}

// run the test
runTest();
