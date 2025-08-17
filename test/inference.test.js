import fs from 'fs';
import assert from 'assert';
import load from 'audio-loader';
import {BasicPitch} from '../src/inference.js';
import {MidiExporter} from '../src/midi.exporter.js';
import pkg from '@tonejs/midi';
const {Midi} = pkg;
import * as tf from '@tensorflow/tfjs';
import * as tfnode from '@tensorflow/tfjs-node';

const midiExport = new MidiExporter();

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

  // load the audio
  const audioPath = process.cwd() + '/test/test-input/C_major.resampled.mp3';
  const audioBuffer = await load(audioPath);

  const frames = [];
  const onsets = [];
  const contours = [];
  let pct = 0;

  // load the model
  const modelFile = process.cwd() + '/model/model.json';
  const model = tf.loadGraphModel('file://' + modelFile);
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


  const melodiaConfig = {
    onsetThresh: 0.25,
    frameThresh: 0.25,
    minNoteLength: 5,
    inferOnsets: true,
    maxFreq: 10000,
    minFreq: 40,
    melodiaTrick: true,
    energyTolerance: 11,
  }

  const notesPoly = midiExport.outputToNotesPoly(frames, onsets, melodiaConfig);
  const bendedNotesPoly = midiExport.addPitchBendsToNoteEvents(contours, notesPoly);
  const poly = midiExport.noteFramesToTime(bendedNotesPoly);

  // nomelodia
  const nomelodiaConfig = {
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
    midiExport.addPitchBendsToNoteEvents(contours, midiExport.outputToNotesPoly(frames, onsets, nomelodiaConfig)));

  const jsonOutputFile = process.cwd() + '/test/test-output/cmajor.test';
  writeDebugOutput(jsonOutputFile, poly, polyNoMelodia);

  // load exported files using node import of JSON
  const inputMelodia = process.cwd() + '/test/test-output/cmajor.test.json';
  const melodiaData = fs.readFileSync(inputMelodia).toString();
  assert.notDeepEqual(melodiaData, '[]', 'C major melodia data should not be empty');

  const inputNomelodia = process.cwd() + '/test/test-output/cmajor.test.nomelodia.json';
  const nomelodiaData = fs.readFileSync(inputNomelodia).toString();
  assert.notDeepEqual(nomelodiaData, '[]', 'C major nomelodia data should not be empty');

  const polyNotes = JSON.parse(melodiaData);
  const polyNoMelodiaNotes = JSON.parse(nomelodiaData);

  assert.equal(toBeCloseToMidi(poly, polyNotes, 1e-3, 0), true, 'exported C major melodia data shall match the calculated data');

  assert.equal(toBeCloseToMidi(polyNoMelodia, polyNoMelodiaNotes, 1e-3, 0), true, 'exported C major nomelodia data shall match the calculated data');

  console.log('C major tests passed matching all asserts');
}


/**
 * TODO: Can correctly evaluate vocal 80 bpm data
 */
async function testVocal() {

  const wavBuffer = await load(process.cwd() + '/test/test-input/vocal-da-80bpm.22050.wav');

  const frames = [];
  const onsets = [];
  const contours = [];
  let pct = 0;

  // load the model
  const modelFile = process.cwd() + '/model/model.json';
  const model = tf.loadGraphModel('file://' + modelFile);
  const basicPitch = new BasicPitch(model);

  // TODO what does prepare do ?
  // const wavData = Array.from(Array(wavBuffer.length).keys()).map(key => wavBuffer._data[key]);
  // const audioBuffer = AudioBuffer.fromArray([wavData], 22050);
  const [preparedDataTensor, audioOriginalLength] = await basicPitch.prepareData(wavBuffer.getChannelData(0));

  const vocalDa80bpmDataPath = process.cwd() + '/test/test-input/vocal-da-80bpm.json';
  const vocalDa80bpmDataFile = fs.readFileSync(vocalDa80bpmDataPath).toString();
  const vocalDa80bpmData = JSON.parse(vocalDa80bpmDataFile);

  const audioWindowedWindows = vocalDa80bpmData.audio_windowed.length;
  const audioWindowedFrames = vocalDa80bpmData.audio_windowed[0].length;
  const audioWindowedChannels = vocalDa80bpmData.audio_windowed[0][0].length;

  assert.deepEqual(preparedDataTensor.shape, [audioWindowedWindows, audioWindowedFrames, audioWindowedChannels], 'prepared data tensor shape should match');

  // TODO what does this conditional do ?
  const conditional = false;
  if (conditional) {

    const preparedData = preparedDataTensor.arraySync();

    assert.deepEqual(preparedData.length, vocalDa80bpmData.audio_windowed.length, 'prepared data length should match');
    assert.deepEqual(audioOriginalLength, vocalDa80bpmData.audio_original_length, 'audio original length should match');

    preparedData.forEach((window, i) => {
      assert.deepEqual(window.length, vocalDa80bpmData.audio_windowed[i].length, 'window length should match');
      window.forEach((frame, j) => {
        assert.deepEqual(frame.length, vocalDa80bpmData.audio_windowed[i][j].length, 'frame length should match');
        frame.forEach((channel, k) => {
          // TODO assert.deepEqual( toAllBeClose(channel, vocalDa80bpmData.audio_windowed[i][j][k], 5e-3, 0), true, 'channel data should match');
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

  assert.deepEqual(pct, 1, 'in vocal test, pct should be 1 ');
  assert.deepEqual(frames.length, vocalDa80bpmData.unwrapped_output.note.length, 'frame data length should match');

  frames.forEach((frame, i) => {
    // TODO assert.deepEqual(toAllBeClose(frame, vocalDa80bpmData.unwrapped_output.note[i], 5e-2, 0), true, 'frame data should match');
  });

  assert.deepEqual(onsets.length, vocalDa80bpmData.unwrapped_output.onset.length, 'onset data length should match');

  onsets.forEach((onset, i) => {
    // TODO assert.deepEqual(toAllBeClose(onset, vocalDa80bpmData.unwrapped_output.onset[i], 5e-3, 0), true, 'onset data should match');
  });

  assert.deepEqual(contours.length, vocalDa80bpmData.unwrapped_output.contour.length, 'contour data length should match');

  contours.forEach((contour, i) => {
    // TODO assert.deepEqual(toAllBeClose(contour, vocalDa80bpmData.unwrapped_output.contour[i], 5e-3, 0), true, 'contour data should match');
  });

  const melodiaConfig = {
    onsetThresh: vocalDa80bpmData.onset_thresh,
    frameThresh: vocalDa80bpmData.frame_thresh,
    minNoteLength: vocalDa80bpmData.min_note_length,
    inferOnsets: true,
    maxFreq: null,
    minFreq: null,
    melodiaTrick: true,
    energyTolerance: 11,
  }

  const toNotesPoly = midiExport.outputToNotesPoly(frames, onsets, melodiaConfig);
  const polyMelodia = midiExport.noteFramesToTime(midiExport.addPitchBendsToNoteEvents(contours, toNotesPoly));

  // -------------------

  const vocalDa80bpmDataPathNoMelodia = process.cwd() + '/test/test-input/vocal-da-80bpm.nomelodia.json';
  const vocalDa80bpmDataFileNoMelodia = fs.readFileSync(vocalDa80bpmDataPathNoMelodia).toString();
  const vocalDa80bpmDataNoMelodia = JSON.parse(vocalDa80bpmDataFileNoMelodia);

  const nomelodiaConfig = {
    onsetThresh: vocalDa80bpmDataNoMelodia.onset_thresh,
    frameThresh: vocalDa80bpmDataNoMelodia.frame_thresh,
    minNoteLength: vocalDa80bpmDataNoMelodia.min_note_length,
    inferOnsets: true,
    maxFreq: null,
    minFreq: null,
    melodiaTrick: false,
    energyTolerance: 11,
  }

  const toNotesPolyMelodia = midiExport.outputToNotesPoly(frames, onsets, nomelodiaConfig);
  const polyNoMelodia = midiExport.noteFramesToTime(midiExport.addPitchBendsToNoteEvents(contours, toNotesPolyMelodia));

  //--------

  function getReceived(data) {
    return data.estimated_notes.map(note => {
      return {
        startTimeSeconds: note[0],
        durationSeconds: note[1] - note[0],
        pitchMidi: note[2],
        amplitude: note[3],
        pitchBends: note[4],
      };
    });
  }

  assert.deepEqual(toBeCloseToMidi(polyMelodia, getReceived(vocalDa80bpmData), 1e-2, 0), true, 'exported vocal data shall match the calculated data');

  assert.deepEqual(toBeCloseToMidi(polyNoMelodia, getReceived(vocalDa80bpmDataNoMelodia), 1e-2, 0), true, 'exported vocal data shall match the calculated data');

  console.log('Vocal test passed matching all asserts');
}

// TODO cleanup the code and fix toAllBeClose asserts
testCMajor();
testVocal();
