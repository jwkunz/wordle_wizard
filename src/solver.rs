use std::collections::BTreeMap;

use serde::Serialize;

use crate::lexicon::Lexicon;
use crate::wordle::{Feedback, Word, score_guess};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum RankMode {
    Entropy,
    CandidateOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Recommendation {
    pub word: Word,
    pub score: f64,
    pub is_candidate: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SolverSnapshot {
    pub history: Vec<(Word, Feedback)>,
    pub remaining_answers: usize,
    pub remaining_guesses: usize,
}

#[derive(Debug, Clone)]
pub struct Solver {
    allowed_guesses: Vec<Word>,
    possible_answers: Vec<Word>,
    history: Vec<(Word, Feedback)>,
}

impl Solver {
    pub fn new(allowed_guesses: Lexicon, possible_answers: Lexicon) -> Self {
        Self {
            allowed_guesses: allowed_guesses.words().to_vec(),
            possible_answers: possible_answers.words().to_vec(),
            history: Vec::new(),
        }
    }

    pub fn snapshot(&self) -> SolverSnapshot {
        SolverSnapshot {
            history: self.history.clone(),
            remaining_answers: self.possible_answers.len(),
            remaining_guesses: self.allowed_guesses.len(),
        }
    }

    pub fn possible_answers(&self) -> &[Word] {
        &self.possible_answers
    }

    pub fn allowed_guesses(&self) -> &[Word] {
        &self.allowed_guesses
    }

    pub fn apply_feedback(&mut self, guess: Word, feedback: Feedback) {
        self.history.push((guess, feedback));
        self.possible_answers
            .retain(|answer| score_guess(guess, *answer) == feedback);
    }

    pub fn top_recommendations(&self, limit: usize, mode: RankMode) -> Vec<Recommendation> {
        let mut recommendations = match mode {
            RankMode::Entropy => self
                .allowed_guesses
                .iter()
                .map(|word| Recommendation {
                    word: *word,
                    score: self.entropy_for(*word),
                    is_candidate: self.possible_answers.binary_search(word).is_ok(),
                })
                .collect::<Vec<_>>(),
            RankMode::CandidateOnly => self
                .possible_answers
                .iter()
                .map(|word| Recommendation {
                    word: *word,
                    score: self.entropy_for(*word),
                    is_candidate: true,
                })
                .collect::<Vec<_>>(),
        };

        recommendations.sort_by(|left, right| {
            right
                .score
                .total_cmp(&left.score)
                .then_with(|| right.is_candidate.cmp(&left.is_candidate))
                .then_with(|| left.word.cmp(&right.word))
        });
        recommendations.truncate(limit);
        recommendations
    }

    pub fn entropy_for(&self, guess: Word) -> f64 {
        if self.possible_answers.is_empty() {
            return 0.0;
        }

        let total = self.possible_answers.len() as f64;
        let mut buckets = BTreeMap::<usize, usize>::new();

        for answer in &self.possible_answers {
            let encoded = score_guess(guess, *answer).encode_base3();
            *buckets.entry(encoded).or_insert(0) += 1;
        }

        buckets.into_values().fold(0.0, |entropy, count| {
            let probability = count as f64 / total;
            entropy - (probability * probability.log2())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::LexiconSource;

    fn lexicon(words: &str) -> Lexicon {
        Lexicon::from_word_list(words, LexiconSource::Bundled)
    }

    #[test]
    fn narrows_candidates_by_exact_feedback() {
        let guesses = lexicon("cigar\nrebut\nsissy\nhumph\nawake\nblush\nfocal\n");
        let answers = lexicon("cigar\nrebut\nsissy\n");
        let mut solver = Solver::new(guesses, answers);

        let guess: Word = "cigar".parse().unwrap();
        let feedback = score_guess(guess, "rebut".parse().unwrap());
        solver.apply_feedback(guess, feedback);

        let actual: Vec<String> = solver
            .possible_answers()
            .iter()
            .map(ToString::to_string)
            .collect();
        assert_eq!(actual, vec!["rebut"]);
    }

    #[test]
    fn candidate_only_mode_stays_within_answers() {
        let guesses = lexicon("crane\nslate\nadieu\n");
        let answers = lexicon("crane\nslate\n");
        let solver = Solver::new(guesses, answers);

        let results = solver.top_recommendations(10, RankMode::CandidateOnly);
        assert!(results.iter().all(|result| result.is_candidate));
        assert!(results.iter().all(|result| {
            let word = result.word.to_string();
            word == "crane" || word == "slate"
        }));
    }
}
