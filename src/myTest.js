import * as tf from "@tensorflow/tfjs";
import fs from "fs";

import { AudioContext } from "web-audio-api";
import { BasicPitch } from "./inference.js";

import {
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from "./toMidi.js";

import pkg from "@tonejs/midi";
const { Midi } = pkg;

import * as tfnode from "@tensorflow/tfjs-node";

/**
 * Write the pitch detection results to file as json and midi
 *
 * @param {*} name the filename
 * @param {*} notes
 * @param {*} noMelodiaNotes
 */
function writeDebugOutput(name, notes, noMelodiaNotes) {

  fs.writeFileSync(`${name}.json`, JSON.stringify(notes));
  fs.writeFileSync(`${name}.nomelodia.json`, JSON.stringify(noMelodiaNotes));

  const midi = new Midi();
  const trackWithMelodia = midi.addTrack();
  trackWithMelodia.name = name;

  notes.forEach((note) => {

    trackWithMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });
    
    /**
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
    */

  });

  const trackNoMelodia = midi.addTrack();
  trackNoMelodia.name = `${name}.nomelodia`;

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

  fs.writeFileSync(`${name}.mid`, midi.toArray());
}

async function asyncCall() {
  const modelFile =
    "/Users/martinsmock/Documents/GitHub/basic-pitch-ts/model/model.json";

  console.log("Load model from file " + modelFile);

  // load the model
  const model = tf.loadGraphModel("file://" + modelFile);

  // the auido file to pitch
  const fileToPitch =
    "/Users/martinsmock/Documents/GitHub/basic-pitch-ts/test_data/C_major.resampled.mp3";
  const wavBuffer = fs.readFileSync(
    `/Users/martinsmock/Documents/GitHub/basic-pitch-ts/test_data/C_major.resampled.mp3`
  );

  // r-sample the audio
  const audioCtx = new AudioContext();

  let audioBuffer = undefined;
  audioCtx.decodeAudioData(
    wavBuffer,
    async (_audioBuffer) => {
      audioBuffer = _audioBuffer;
    },
    () => {
      console.log("Error during audio decoding and re-sampling");
    }
  );

  // wait until all is done
  while (audioBuffer === undefined) {
    await new Promise((r) => setTimeout(r, 1));
  }

  console.log("Run Basic Pitch with audio " + fileToPitch);

  // run the basic pitch
  const frames = [];  // frames where a note is active
  const onsets = [];  // the first few frames of every note
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

  console.log("pct is = " + pct);

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
  const jsonOutputFile = "test_data/myTestPoly";
  writeDebugOutput(jsonOutputFile, poly, polyNoMelodia);
}

// run the test
asyncCall();
