import fs from 'fs';
import { AudioContext } from 'web-audio-api';
import { Resampler } from '../lib/resampler.js';
import assert from 'assert';

/**
 *
 */
async function runTest() {

  // the auido file to pitch
  const fileToPitch = process.cwd() + '/test/test-input/guitar-arpeggio.mp3';
  const clip = fs.readFileSync(fileToPitch);

  // decode the audio clip data. keeps the sample rate. 
  const audioCtx = new AudioContext();
  audioCtx.decodeAudioData(clip, onsuccess, onerror);

  function onerror() {
    console.log("Error during audio decoding.");
  }

  function onsuccess(inputBuffer) {

    console.log('resample audio with sample rate ' + inputBuffer.sampleRate + ', buffer length ' + inputBuffer.length +
      ', duration ' + inputBuffer.duration + ' and ' + inputBuffer.numberOfChannels + ' channel.');

    const rate = 22050;
    const converter = new Resampler();
    const resampled = converter.resample(inputBuffer.getChannelData(0), inputBuffer.sampleRate, rate);

    let outputBuffer = audioCtx.createBuffer(
      inputBuffer.numberOfChannels,
      resampled.length, // size (sampleRate * duration in sec)
      rate,
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

    assert.deepEqual(outputBuffer.sampleRate, 22050, 'expect to be resampled to 22050');
    assert.deepEqual(outputBuffer.length, 210621, 'expect the buffer length to be 210621');
    assert.deepEqual(outputBuffer.duration.toFixed(2), inputBuffer.duration.toFixed(2), 'expect the buffer length to be 9.55..');
  }

}

// run the test
runTest();
