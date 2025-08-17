import fs from 'fs';
import assert from 'assert';

import load from 'audio-loader';

import {
  AudioContext
} from 'web-audio-api';

import {
  BasicPitch
} from '../src/inference.js';

import {
  MidiExporter
} from '../src/midi.exporter.js';

import pkg from '@tonejs/midi';
const { Midi } = pkg;

import * as tf from '@tensorflow/tfjs';
import * as tfnode from '@tensorflow/tfjs-node';

const midiExport = new MidiExporter();

/**
 *
 * @param {*} received
 * @param {*} argument
 * @param {*} atol
 * @param {*} rtol
 * @returns
 */
export const toAllBeClose = (received, argument, atol = 1e-3, rtol = 1e-5) => {

  if (received.length !== argument.length) {
    return {
      pass: false,
      message: () => `Received and expected lengths do not match! ` +
        `Received has length ${received.length}. ` +
        `Expected has length ${argument.length}.`,
    };
  }

  for (let i = 0; i < received.length; ++i) {
    if (Math.abs(received[i] - argument[i]) >
      atol + rtol * Math.abs(received[i])) {
      return {
        pass: false,
        message: () => `Expected all number elements in ${JSON.stringify(received.slice(Math.max(0, i - 5), Math.min(received.length - 1, i + 5)), null, '  ')} ` +
          `to be close to ${JSON.stringify(argument.slice(Math.max(0, i - 5), Math.min(argument.length - 1, i + 5)), null, '  ')} ` +
          `(this is a slice of the data at the location + -5 elements). ` +
          `${received[i]} != ${argument[i]} at index ${i}.`,
      };
    }
  }

  return {
    pass: true,
    message: () => ``,
  };
};

/**
 *
 * @param {*} namePrefix
 * @param {*} notes
 * @param {*} noMelodiaNotes
 */
function writeDebugOutput(namePrefix, notes, noMelodiaNotes) {

  fs.writeFileSync(`${namePrefix}.json`, JSON.stringify(notes));
  fs.writeFileSync(`${namePrefix}.nomelodia.json`, JSON.stringify(noMelodiaNotes));

  // create midi track
  const midi = new Midi();
  const trackWithMelodia = midi.addTrack();
  trackWithMelodia.name = namePrefix;

  notes.forEach(note => {
    trackWithMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });
    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) => trackWithMelodia.addPitchBend({
        time: note.startTimeSeconds +
          (note.durationSeconds * i) / note.pitchBends.length,
        value: b,
      }));
    }
  });

  // nomelodia
  const trackNoMelodia = midi.addTrack();
  trackNoMelodia.name = `${namePrefix}.nomelodia`;
  noMelodiaNotes.forEach(note => {
    trackNoMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });
    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) => trackWithMelodia.addPitchBend({
        time: note.startTimeSeconds +
          (note.durationSeconds * i) / note.pitchBends.length,
        value: b,
      }));
    }
  });
  fs.writeFileSync(`${namePrefix}.mid`, midi.toArray());
}

/**
 *
 * @param {*} received
 * @param {*} argument
 * @param {*} atol
 * @param {*} rtol
 * @returns
 */
function toBeCloseToMidi(received, argument, atol = 1e-3, rtol = 1e-5) {

  for (let i = 0; i < received.length; ++i) {

    if (received[i].pitchBends !== undefined &&
      argument[i].pitchBends !== undefined) {
      const isClose = toAllBeClose(received[i].pitchBends, argument[i].pitchBends, 1e-3, 0);
      if (!isClose.pass) {
        return true;
      }
    }

    if ((received[i].pitchBends === undefined && argument[i].pitchBends !== undefined) ||
      (received[i].pitchBends !== undefined && argument[i].pitchBends === undefined)) {
      console.log(`pitchbends for note ${i} do not match. ${JSON.stringify(received[i].pitchBends)} != ${JSON.stringify(argument[i].pitchBends)}`);
      return false;
    }

    if (received[i].pitchMidi !== argument[i].pitchMidi ||
      Math.abs(received[i].amplitude - argument[i].amplitude) >
      atol + rtol * Math.abs(received[i].amplitude) ||
      Math.abs(received[i].durationSeconds - argument[i].durationSeconds) >
      atol + rtol * Math.abs(received[i].durationSeconds) ||
      Math.abs(received[i].startTimeSeconds - argument[i].startTimeSeconds) >
      atol + rtol * Math.abs(received[i].startTimeSeconds)) {

      console.log(`Expected all midi elements in ${JSON.stringify(received.slice(Math.max(0, i - 5), Math.min(received.length - 1, i + 5)), null, '  ')} to be close to ${JSON.stringify(argument.slice(Math.max(0, i - 5), Math.min(argument.length - 1, i + 5)), null, '  ')} ` +
        `(this is a slice of the data at the location + -5 elements). ` +
        `${JSON.stringify(received[i], null, '  ')} != ${JSON.stringify(argument[i], null, '  ')} at index ${i}.`);

      return false;
    }
  }
  return true;
}

/**
 * Can correctly evaluate vocal C major sample
 */
async function testCMajor() {

  // load the model
  const modelFile = process.cwd() + '/model/model.json';
  const model = tf.loadGraphModel('file://' + modelFile);

  const audioPath = process.cwd() + '/test/test-input/C_major.resampled.mp3';
  console.log('read audio file ' + audioPath);

  const wavBuffer = fs.readFileSync(audioPath);
  const audioCtx = new AudioContext();

  let audioBuffer = undefined;
  audioCtx.decodeAudioData(wavBuffer, async (_audioBuffer) => {
    audioBuffer = _audioBuffer;
  }, () => {
    console.log('Error during audio decoding to re-sample');
  });
  while (audioBuffer === undefined) {
    await new Promise(r => setTimeout(r, 1));
  }

  const frames = [];
  const onsets = [];
  const contours = [];
  let pct = 0;

  const basicPitch = new BasicPitch(model);
  await basicPitch.evaluateModel(audioBuffer, (f, o, c) => {
    frames.push(...f);
    onsets.push(...o);
    contours.push(...c);
  }, (p) => {
    pct = p;
  });

  assert.deepEqual(pct, 1, 'in C major test, pct should be 1 ');

  const framesForArray = [];
  const onsetsForArray = [];
  const contoursForArray = [];
  pct = 0;

  await basicPitch.evaluateModel(audioBuffer.getChannelData(0), (f, o, c) => {
    framesForArray.push(...f);
    onsetsForArray.push(...o);
    contoursForArray.push(...c);
  }, (p) => {
    pct = p;
  });

  assert.deepEqual(pct, 1, 'in C major test, pct should be 1 ');
  assert.deepEqual(framesForArray, frames, 'in C major test, frames should match');
  assert.deepEqual(onsetsForArray, onsets, 'in C major test, onsets should match');
  assert.deepEqual(contoursForArray, contours, 'in C major test, contours should match');


  let config = {
    onsetThresh: 0.25,
    frameThresh: 0.25,
    minNoteLength: 5,
    inferOnsets: true,
    maxFreq: 10000,
    minFreq: 40,
    melodiaTrick: true,
    energyTolerance: 11,
  }

  const notesPoly = midiExport.outputToNotesPoly(frames, onsets, config);
  const bendedNotesPoly = midiExport.addPitchBendsToNoteEvents(contours, notesPoly);
  const poly = midiExport.noteFramesToTime(bendedNotesPoly);

  // nomelodia
  config = {
    onsetThresh: 0.5,
    frameThresh: 0.5,
    minNoteLength: 5,
    inferOnsets: true,
    maxFreq: 10000,
    minFreq: 40,
    melodiaTrick: false,
    energyTolerance: 11,
  }

  const polyNoMelodia = midiExport.noteFramesToTime(
    midiExport.addPitchBendsToNoteEvents(contours, midiExport.outputToNotesPoly(frames, onsets, config)));

  const jsonOutputFile = process.cwd() + '/test/test-output/cmajor.test';
  writeDebugOutput(jsonOutputFile, poly, polyNoMelodia);

  // load exported files using node import of JSON
  const inputMelodia = process.cwd() + '/test/test-output/cmajor.test.json';
  const inputNomelodia = process.cwd() + '/test/test-output/cmajor.test.nomelodia.json';

  // import fles to compare
  const melodiaData = fs.readFileSync(inputMelodia).toString();
  assert.notDeepEqual(melodiaData, '[]', 'C major melodia data should not be empty');

  const nomelodiaData = fs.readFileSync(inputNomelodia).toString();
  assert.notDeepEqual(nomelodiaData, '[]', 'C major nomelodia data should not be empty');

  const polyNotes = JSON.parse(melodiaData);
  const polyNoMelodiaNotes = JSON.parse(nomelodiaData);

  assert.equal(toBeCloseToMidi(poly, polyNotes, 1e-3, 0), true, 'exported C major melodia data shall match the calculated data');

  assert.equal(toBeCloseToMidi(polyNoMelodia, polyNoMelodiaNotes, 1e-3, 0), true, 'exported C major nomelodia data shall match the calculated data');

  console.log('C major tests passed matching all asserts');
};

/**
* TODO: Can correctly evaluate vocal 80 bpm data
*/
async function test2() {

  const vocalDa80bpmData = require(process.cwd() + '/test/test-input/vocal-da-80bpm.json');
  const vocalDa80bpmDataNoMelodia = require(process.cwd() + '/test/test-input/vocal-da-80bpm.nomelodia.json');

  const wavBuffer = await load(process.cwd() + '/test/test-input/vocal-da-80bpm.22050.wav');

  const frames = [];
  const onsets = [];
  const contours = [];
  let pct = 0;

  const basicPitch = new BasicPitch(`file://${__dirname}/../model/model.json`);
  const wavData = Array.from(Array(wavBuffer.length).keys()).map(key => wavBuffer._data[key]);
  const audioBuffer = AudioBuffer.fromArray([wavData], 22050);

  const [preparedDataTensor, audioOriginalLength] = await basicPitch.prepareData(audioBuffer.getChannelData(0));

  const audioWindowedWindows = vocalDa80bpmData.audio_windowed.length;
  const audioWindowedFrames = vocalDa80bpmData.audio_windowed[0].length;
  const audioWindowedChannels = vocalDa80bpmData.audio_windowed[0][0].length;

  expect(preparedDataTensor.shape).toEqual([
    audioWindowedWindows,
    audioWindowedFrames,
    audioWindowedChannels,
  ]);

  const conditional = false;
  if (conditional) {
    
    const preparedData = preparedDataTensor.arraySync();
    
    expect(preparedData.length).toStrictEqual(vocalDa80bpmData.audio_windowed.length);
    expect(audioOriginalLength).toStrictEqual(vocalDa80bpmData.audio_original_length);

    preparedData.forEach((window, i) => {
      expect(window.length).toStrictEqual(vocalDa80bpmData.audio_windowed[i].length);
      window.forEach((frame, j) => {
        expect(frame.length).toStrictEqual(vocalDa80bpmData.audio_windowed[i][j].length);
        frame.forEach((channel, k) => {
          expect(channel).toBeCloseTo(vocalDa80bpmData.audio_windowed[i][j][k], 4);
        });
      });
    });
  }

  await basicPitch.evaluateModel(wavBuffer, (f, o, c) => {
    frames.push(...f);
    onsets.push(...o);
    contours.push(...c);
  }, (p) => {
    pct = p;
  });

  expect(pct).toEqual(1);

  expect(frames.length).toStrictEqual(vocalDa80bpmData.unwrapped_output.note.length);

  frames.forEach((frame, i) => {
    expect(frame).toAllBeClose(vocalDa80bpmData.unwrapped_output.note[i], 5e-3, 0);
  });
  expect(onsets.length).toStrictEqual(vocalDa80bpmData.unwrapped_output.onset.length);

  onsets.forEach((onset, i) => {
    expect(onset).toAllBeClose(vocalDa80bpmData.unwrapped_output.onset[i], 5e-3, 0);
  });
  expect(contours.length).toStrictEqual(vocalDa80bpmData.unwrapped_output.contour.length);

  contours.forEach((contour, i) => {
    expect(contour).toAllBeClose(vocalDa80bpmData.unwrapped_output.contour[i], 5e-3, 0);
  });

  const poly = midiExport.anoteFramesToTime(midiExport.addPitchBendsToNoteEvents(contours, midiExport.outputToNotesPoly(frames, onsets, vocalDa80bpmData.onset_thresh, vocalDa80bpmData.frame_thresh, vocalDa80bpmData.min_note_length)));

  const polyNoMelodia = midiExport.anoteFramesToTime(midiExport.addPitchBendsToNoteEvents(contours, midiExport.outputToNotesPoly(frames, onsets, vocalDa80bpmDataNoMelodia.onset_thresh, vocalDa80bpmDataNoMelodia.frame_thresh, vocalDa80bpmDataNoMelodia.min_note_length, true, null, null, false)));

  expect(polyNoMelodia).toBeCloseToMidi(vocalDa80bpmDataNoMelodia.estimated_notes.map(note => {
    return {
      startTimeSeconds: note[0],
      durationSeconds: note[1] - note[0],
      pitchMidi: note[2],
      amplitude: note[3],
      pitchBends: note[4],
    };
  }), 1e-2, 0);

  expect(poly).toBeCloseToMidi(vocalDa80bpmData.estimated_notes.map(note => {
    return {
      startTimeSeconds: note[0],
      durationSeconds: note[1] - note[0],
      pitchMidi: note[2],
      amplitude: note[3],
      pitchBends: note[4],
    };
  }), 1e-2, 0);

}
// 100000);


testCMajor(); 