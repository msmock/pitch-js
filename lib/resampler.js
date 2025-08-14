/**
 * @fileoverview The WaveResampler class.
 * 
 * Based on original work 
 * @see https://github.com/rochars/wave-resampler
 * 
 */

import { Interpolator } from './interpolator.js';
import { FIRLPF } from './fir-lpf.js';
import { ButterworthLPF } from './butterworth-lpf.js';

/**
 * WaveResampler class for resampling audio samples.
 */
export class Resampler {
  
  /**
   * Configures which resampling method uses LPF by default.
   * @private
   */
  static DEFAULT_LPF_USE = {
    'point': false,
    'linear': false,
    'cubic': true,
    'sinc': true
  };

  /**
   * The default orders for the LPF types.
   * @private
   */
  static DEFAULT_LPF_ORDER = {
    'IIR': 16,
    'FIR': 71
  };

  /**
   * The classes to use with each LPF type.
   * @private
   */
  static DEFAULT_LPF = {
    'IIR': ButterworthLPF,
    'FIR': FIRLPF
  };

  /**
   * Change the sample rate of the samples to a new sample rate.
   * @param {!Array|!TypedArray} samples The original samples.
   * @param {number} oldSampleRate The original sample rate.
   * @param {number} sampleRate The target sample rate.
   * @param {?Object} details The extra configuration, if needed.
   * @return {!Float64Array} the new samples.
   */
  resample(samples, oldSampleRate, sampleRate, details={}) {  
    // Make the new sample container
    let rate = ((sampleRate - oldSampleRate) / oldSampleRate) + 1;
    let newSamples = new Float64Array(samples.length * (rate));
    // Create the interpolator
    details.method = details.method || 'cubic';
    let interpolator = new Interpolator(
      samples.length,
      newSamples.length,
      {
        method: details.method,
        tension: details.tension || 0,
        sincFilterSize: details.sincFilterSize || 6,
        sincWindow: details.sincWindow || undefined
      });
    // Resample + LPF
    if (details.LPF === undefined) {
      details.LPF = Resampler.DEFAULT_LPF_USE[details.method];
    } 
    if (details.LPF) {
      details.LPFType = details.LPFType || 'IIR';
      const LPF = Resampler.DEFAULT_LPF[details.LPFType];
      // Upsampling
      if (sampleRate > oldSampleRate) {
        let filter = new LPF(
          details.LPFOrder || Resampler.DEFAULT_LPF_ORDER[details.LPFType],
          sampleRate,
          (oldSampleRate / 2));
        this.upsample_(
          samples, newSamples, interpolator, filter);
      // Downsampling
      } else {
        let filter = new LPF(
          details.LPFOrder || Resampler.DEFAULT_LPF_ORDER[details.LPFType],
          oldSampleRate,
          sampleRate / 2);
        this.downsample_(
          samples, newSamples, interpolator, filter);
      }
    // Resample, no LPF
    } else {
      this.resample_(samples, newSamples, interpolator);
    }
    return newSamples;
  }

  /**
   * Resample.
   * @param {!Array|!TypedArray} samples The original samples.
   * @param {!Float64Array} newSamples The container for the new samples.
   * @param {Object} interpolator The interpolator.
   * @private
   */
  resample_(samples, newSamples, interpolator) {
    // Resample
    for (let i = 0, len = newSamples.length; i < len; i++) {
      newSamples[i] = interpolator.interpolate(i, samples);
    }
  }

  /**
   * Upsample with LPF.
   * @param {!Array|!TypedArray} samples The original samples.
   * @param {!Float64Array} newSamples The container for the new samples.
   * @param {Object} interpolator The interpolator.
   * @param {Object} filter The LPF object.
   * @private
   */
  upsample_(samples, newSamples, interpolator, filter) {
    // Resample and filter
    for (let i = 0, len = newSamples.length; i < len; i++) {
      newSamples[i] = filter.filter(interpolator.interpolate(i, samples));
    }
    // Reverse filter
    filter.reset();
    for (let i = newSamples.length - 1; i >= 0; i--) {
      newSamples[i]  = filter.filter(newSamples[i]);
    }
  }

  /**
   * Downsample with LPF.
   * @param {!Array|!TypedArray} samples The original samples.
   * @param {!Float64Array} newSamples The container for the new samples.
   * @param {Object} interpolator The interpolator.
   * @param {Object} filter The LPF object.
   * @private
   */
  downsample_(samples, newSamples, interpolator, filter) {
    // Filter
    for (let i = 0, len = samples.length; i < len; i++) {
      samples[i]  = filter.filter(samples[i]);
    }
    // Reverse filter
    filter.reset();
    for (let i = samples.length - 1; i >= 0; i--) {
      samples[i]  = filter.filter(samples[i]);
    }
    // Resample
    this.resample_(samples, newSamples, interpolator);
  }
}