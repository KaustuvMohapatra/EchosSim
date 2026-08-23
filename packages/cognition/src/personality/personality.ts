/** The fourteen normalized (0..1) personality parameters. Immutable after build. */
export enum PersonalityTrait {
  Openness = 0,
  Conscientiousness = 1,
  Extraversion = 2,
  Agreeableness = 3,
  EmotionalVolatility = 4,
  Curiosity = 5,
  Patience = 6,
  Sociability = 7,
  RiskTolerance = 8,
  Generosity = 9,
  Honesty = 10,
  Ambition = 11,
  GrudgeRetention = 12,
  RoutinePreference = 13,
}

export const TRAIT_COUNT = 14;

function validateTrait(value: number): number {
  if (Number.isNaN(value) || value < 0 || value > 1)
    throw new Error("Personality traits must be within [0,1].");
  return value;
}

export class PersonalityProfile {
  private constructor(private readonly values: readonly number[]) {}

  static uniform(value: number): PersonalityProfile {
    validateTrait(value);
    return new PersonalityProfile(new Array<number>(TRAIT_COUNT).fill(value));
  }

  static balanced(): PersonalityProfile {
    return PersonalityProfile.uniform(0.5);
  }

  get(trait: PersonalityTrait): number {
    return this.values[trait as number]!;
  }

  edit(): { set(t: PersonalityTrait, v: number): PersonalityBuilder } & { build(): PersonalityProfile } {
    const b = new PersonalityBuilder([...this.values]);
    return b as never;
  }

  toArray(): number[] {
    return [...this.values];
  }

  static fromArray(values: readonly number[]): PersonalityProfile {
    if (values.length !== TRAIT_COUNT) throw new Error(`Expected ${TRAIT_COUNT} traits.`);
    values.forEach(validateTrait);
    return new PersonalityProfile([...values]);
  }

  /** Mira fixture personality (master spec Sprint 14 starting values). */
  static miraLike(): PersonalityProfile {
    return PersonalityProfile.balanced()
      .edit()
      .set(PersonalityTrait.Openness, 0.89)
      .set(PersonalityTrait.Conscientiousness, 0.71)
      .set(PersonalityTrait.Extraversion, 0.62)
      .set(PersonalityTrait.Agreeableness, 0.68)
      .set(PersonalityTrait.EmotionalVolatility, 0.48)
      .set(PersonalityTrait.Curiosity, 0.9)
      .set(PersonalityTrait.Patience, 0.55)
      .set(PersonalityTrait.Sociability, 0.67)
      .set(PersonalityTrait.RiskTolerance, 0.49)
      .set(PersonalityTrait.Generosity, 0.78)
      .set(PersonalityTrait.Honesty, 0.75)
      .set(PersonalityTrait.Ambition, 0.78)
      .set(PersonalityTrait.GrudgeRetention, 0.68)
      .set(PersonalityTrait.RoutinePreference, 0.43)
      .build();
  }
}

export class PersonalityBuilder {
  constructor(private readonly values: number[]) {}

  set(trait: PersonalityTrait, value: number): this {
    validateTrait(value);
    this.values[trait as number] = value;
    return this;
  }

  build(): PersonalityProfile {
    return PersonalityProfile.fromArray(this.values);
  }
}
