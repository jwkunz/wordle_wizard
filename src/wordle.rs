use std::fmt;
use std::str::FromStr;

use serde::Serialize;

pub const WORD_SIZE: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
pub struct Word([u8; WORD_SIZE]);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WordError {
    InvalidLength { actual: usize },
    InvalidCharacter { index: usize, value: char },
}

impl fmt::Display for WordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLength { actual } => {
                write!(
                    f,
                    "expected a {WORD_SIZE}-letter word, got {actual} characters"
                )
            }
            Self::InvalidCharacter { index, value } => {
                write!(f, "invalid character '{value}' at index {index}")
            }
        }
    }
}

impl std::error::Error for WordError {}

impl Word {
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.0).expect("stored word must be valid ASCII")
    }

    pub fn letters(&self) -> &[u8; WORD_SIZE] {
        &self.0
    }
}

impl fmt::Display for Word {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Word {
    type Err = WordError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.chars().count() != WORD_SIZE {
            return Err(WordError::InvalidLength {
                actual: value.chars().count(),
            });
        }

        let mut bytes = [0_u8; WORD_SIZE];

        for (index, ch) in value.chars().enumerate() {
            if !ch.is_ascii_lowercase() {
                return Err(WordError::InvalidCharacter { index, value: ch });
            }
            bytes[index] = ch as u8;
        }

        Ok(Self(bytes))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
pub enum Clue {
    Miss,
    Present,
    Correct,
}

impl Clue {
    pub fn from_symbol(symbol: char) -> Option<Self> {
        match symbol {
            'm' | 'M' | 'b' | 'B' => Some(Self::Miss),
            'p' | 'P' | 's' | 'S' | 'y' | 'Y' => Some(Self::Present),
            'c' | 'C' | 'f' | 'F' | 'g' | 'G' => Some(Self::Correct),
            _ => None,
        }
    }

    pub fn symbol(self) -> char {
        match self {
            Self::Miss => 'm',
            Self::Present => 'p',
            Self::Correct => 'c',
        }
    }
}

impl fmt::Display for Clue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.symbol().to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
pub struct Feedback([Clue; WORD_SIZE]);

impl Feedback {
    pub const ALL_CORRECT: Self = Self([Clue::Correct; WORD_SIZE]);

    pub fn from_clues(clues: [Clue; WORD_SIZE]) -> Self {
        Self(clues)
    }

    pub fn clues(&self) -> &[Clue; WORD_SIZE] {
        &self.0
    }

    pub fn encode_base3(&self) -> usize {
        self.0.iter().fold(0_usize, |acc, clue| {
            let digit = match clue {
                Clue::Miss => 0,
                Clue::Present => 1,
                Clue::Correct => 2,
            };
            (acc * 3) + digit
        })
    }
}

impl fmt::Display for Feedback {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for clue in self.0 {
            f.write_str(&clue.symbol().to_string())?;
        }
        Ok(())
    }
}

impl FromStr for Feedback {
    type Err = WordError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.chars().count() != WORD_SIZE {
            return Err(WordError::InvalidLength {
                actual: value.chars().count(),
            });
        }

        let mut clues = [Clue::Miss; WORD_SIZE];

        for (index, ch) in value.chars().enumerate() {
            clues[index] =
                Clue::from_symbol(ch).ok_or(WordError::InvalidCharacter { index, value: ch })?;
        }

        Ok(Self(clues))
    }
}

pub fn score_guess(guess: Word, answer: Word) -> Feedback {
    let guess_letters = guess.letters();
    let answer_letters = answer.letters();

    let mut clues = [Clue::Miss; WORD_SIZE];
    let mut counts = [0_u8; 26];

    for index in 0..WORD_SIZE {
        if guess_letters[index] == answer_letters[index] {
            clues[index] = Clue::Correct;
        } else {
            let answer_index = usize::from(answer_letters[index] - b'a');
            counts[answer_index] += 1;
        }
    }

    for index in 0..WORD_SIZE {
        if clues[index] == Clue::Correct {
            continue;
        }

        let guess_index = usize::from(guess_letters[index] - b'a');
        if counts[guess_index] > 0 {
            clues[index] = Clue::Present;
            counts[guess_index] -= 1;
        }
    }

    Feedback::from_clues(clues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_words() {
        assert!("tool".parse::<Word>().is_err());
        assert!("tools".parse::<Word>().is_ok());
        assert!("to0ls".parse::<Word>().is_err());
        assert!("TOOLS".parse::<Word>().is_err());
    }

    #[test]
    fn scores_simple_guess() {
        let guess: Word = "crate".parse().unwrap();
        let answer: Word = "trace".parse().unwrap();
        let feedback = score_guess(guess, answer);

        assert_eq!(feedback.to_string(), "pccpc");
    }

    #[test]
    fn scores_duplicate_letters_correctly() {
        let guess: Word = "sassy".parse().unwrap();
        let answer: Word = "assay".parse().unwrap();
        let feedback = score_guess(guess, answer);

        assert_eq!(feedback.to_string(), "ppcmc");
    }

    #[test]
    fn parses_feedback_aliases() {
        let feedback: Feedback = "mSfFg".parse().unwrap();
        assert_eq!(feedback.to_string(), "mpccc");
    }
}
