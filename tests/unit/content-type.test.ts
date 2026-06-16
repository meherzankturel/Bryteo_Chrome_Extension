import { describe, it, expect } from 'vitest';
import { classifyContent, describeForUser } from '@/lib/content-type';

describe('classifyContent', () => {
  it('flags known educational categories', () => {
    expect(classifyContent('Education')).toBe('educational');
    expect(classifyContent('Science & Technology')).toBe('educational');
    expect(classifyContent('Howto & Style')).toBe('educational');
    expect(classifyContent('News & Politics')).toBe('educational');
    expect(classifyContent('Nonprofits & Activism')).toBe('educational');
  });

  it('flags known non-educational categories', () => {
    expect(classifyContent('Music')).toBe('non-educational');
    expect(classifyContent('Entertainment')).toBe('non-educational');
    expect(classifyContent('Comedy')).toBe('non-educational');
    expect(classifyContent('Sports')).toBe('non-educational');
    expect(classifyContent('Gaming')).toBe('non-educational');
    expect(classifyContent('Trailers')).toBe('non-educational');
    expect(classifyContent('Movies')).toBe('non-educational');
    expect(classifyContent('Shows')).toBe('non-educational');
    expect(classifyContent('Autos & Vehicles')).toBe('non-educational');
    expect(classifyContent('Travel & Events')).toBe('non-educational');
    expect(classifyContent('Pets & Animals')).toBe('non-educational');
  });

  it('marks ambiguous categories as borderline', () => {
    expect(classifyContent('People & Blogs')).toBe('borderline');
    expect(classifyContent('Film & Animation')).toBe('borderline');
  });

  it('treats unknown / missing category as borderline', () => {
    expect(classifyContent(undefined)).toBe('borderline');
    expect(classifyContent('Something Unrecognised')).toBe('borderline');
    expect(classifyContent('')).toBe('borderline');
  });
});

describe('describeForUser', () => {
  it('lowercases the supplied category', () => {
    expect(describeForUser('Music')).toBe('music');
    expect(describeForUser('Science & Technology')).toBe('science & technology');
  });

  it('falls back when no category is known', () => {
    expect(describeForUser(undefined)).toBe('this type of');
  });
});
