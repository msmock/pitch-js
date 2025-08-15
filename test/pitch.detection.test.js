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

import { Resampler } from '../lib/resampler.js';

import * as tfnode from '@tensorflow/tfjs-node';

/**
 * Write the pitch detection results to file as json and midi
 *
 * @param {*} namePrefix the filename prefix
 * @param {*} notes
 * @param {*} noMelodiaNotes
 */
function writeOutputData(namePrefix, notes, noMelodiaNotes) {

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

  const nomelodia = false;
  if (nomelodia) {

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
  }

  // write the midi track
  fs.writeFileSync(`${namePrefix}.mid`, midi.toArray());
}

/**
 * resample the audio to rate, required by pitch detection (22050)
 * 
 * @param {*} audioBuffer 
 * @param {*} audioCtx 
 * @returns resampled AudioBuffer 
 */
function resample(audioBuffer, audioCtx) {

  const rate = 22050;
  const converter = new Resampler();
  const resampled = converter.resample(audioBuffer.getChannelData(0), audioBuffer.sampleRate, rate);

  let outputBuffer = audioCtx.createBuffer(
    audioBuffer.numberOfChannels,
    resampled.length, // size (sampleRate * duration in sec)
    rate
  );

  // fill the audio buffer channel with white noise
  for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
    const channelData = outputBuffer.getChannelData(channel);
    for (let i = 0; i < outputBuffer.length; i++) {
      channelData[i] = resampled[i];
    }
  };

  console.log('resampled audio to sample rate ' + outputBuffer.sampleRate + ', buffer length ' + outputBuffer.length +
    ', duration ' + outputBuffer.duration + ' and ' + outputBuffer.numberOfChannels + ' channel.');

  audioBuffer = outputBuffer;
  return audioBuffer;
}

/**
 * TODO: the C_maj.resampled.mp3 provides the tempo, while we loose the tempo, when C_maj.mp3 is resampled here
 */
async function runTest() {

  const modelFile = process.cwd() + '/model/model.json';
  const fileToPitch = process.cwd() + '/test/test-input/guitar-lick.wav';

  // load the model
  console.log('Load model from file ' + modelFile);
  const model = tf.loadGraphModel('file://' + modelFile);

  // the auido file to pitch
  const clip = fs.readFileSync(fileToPitch);

  // decode the audio file
  const audioCtx = new AudioContext();
  audioCtx.decodeAudioData(clip, whenDecoded, () => console.log('Error during decoding of ' + fileToPitch));

  /**
   * @param {*} audioBuffer 
   */
  async function whenDecoded(audioBuffer) {

    console.log('Run Basic Pitch with audio ' + fileToPitch);
    console.log('AudioBuffer has sampleRate ' + audioBuffer.sampleRate + ', ' +
      audioBuffer.numberOfChannels + ' channel ' + ', buffer length ' + audioBuffer.length +
      ', duration ' + audioBuffer.duration);

    // resample the audio file to rate 22050  
    audioBuffer = resample(audioBuffer, audioCtx);

    // run the basic pitch detection
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

    // TODO: tune the settings for jazz guitar
    let onsetThresh = 0.25;
    let frameThresh = 0.25;
    let minNoteLength = 5;
    let inferOnsets = true;
    let maxFreq = 1000;
    let minFreq = 80;
    let melodiaTrick = true;

    // convert to note events with pitch, time and
    const poly = noteFramesToTime(
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

    // nomelodia
    melodiaTrick = false;

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
    const jsonOutputFile = process.cwd() + '/test/test-output/pitch.detection.test';
    writeOutputData(jsonOutputFile, poly, polyNoMelodia);

    console.log('Finished pitch detection of file ' + fileToPitch);
  }
}

// run the test
runTest();

