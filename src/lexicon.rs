use serde::Serialize;
use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::Path;

use crate::wordle::{WORD_SIZE, Word};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum LexiconSource {
    Bundled,
    Remote,
    UserProvided,
}

#[derive(Debug, Clone)]
pub struct Lexicon {
    source: LexiconSource,
    words: Vec<Word>,
}

impl Lexicon {
    pub fn bundled_guesses() -> Self {
        Self::from_word_list(include_str!("../data/guesses.txt"), LexiconSource::Bundled)
    }

    pub fn bundled_answers() -> Self {
        Self::from_word_list(include_str!("../data/answers.txt"), LexiconSource::Bundled)
    }

    pub fn new(source: LexiconSource, words: Vec<Word>) -> Self {
        Self { source, words }
    }

    pub fn source(&self) -> &LexiconSource {
        &self.source
    }

    pub fn words(&self) -> &[Word] {
        &self.words
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn is_empty(&self) -> bool {
        self.words.is_empty()
    }

    pub fn from_file(path: impl AsRef<Path>, source: LexiconSource) -> io::Result<Self> {
        let content = fs::read_to_string(path)?;
        Ok(Self::from_word_list(&content, source))
    }

    pub fn from_word_list(content: &str, source: LexiconSource) -> Self {
        let mut unique = BTreeSet::new();

        for line in content.lines() {
            let normalized = line.trim().to_ascii_lowercase();
            if normalized.len() != WORD_SIZE {
                continue;
            }

            if !normalized.chars().all(|ch| ch.is_ascii_lowercase()) {
                continue;
            }

            if let Ok(word) = normalized.parse::<Word>() {
                unique.insert(word);
            }
        }

        Self {
            source,
            words: unique.into_iter().collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_non_five_letter_entries() {
        let lexicon = Lexicon::from_word_list(
            "crane\nCrate\na-b-c\nword\nspore\nspore\n",
            LexiconSource::Remote,
        );

        let actual: Vec<String> = lexicon.words().iter().map(ToString::to_string).collect();
        assert_eq!(actual, vec!["crane", "crate", "spore"]);
    }
}
