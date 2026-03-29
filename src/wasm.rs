use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::lexicon::{Lexicon, LexiconSource};
use crate::solver::{RankMode, Recommendation, Solver};
use crate::wordle::{Feedback, Word};

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|error| JsValue::from_str(&format!("serialization error: {error}")))
}

fn parse_word(value: &str) -> Result<Word, JsValue> {
    value
        .parse::<Word>()
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

fn parse_feedback(value: &str) -> Result<Feedback, JsValue> {
    value
        .parse::<Feedback>()
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[derive(Debug, Clone, Serialize)]
struct WasmDictionaryStatus {
    guesses: usize,
    answers: usize,
    guesses_source: LexiconSource,
    answers_source: LexiconSource,
}

#[derive(Debug, Clone, Serialize)]
struct WasmRecommendationView {
    word: String,
    score: f64,
    is_candidate: bool,
}

impl From<Recommendation> for WasmRecommendationView {
    fn from(value: Recommendation) -> Self {
        Self {
            word: value.word.to_string(),
            score: value.score,
            is_candidate: value.is_candidate,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct WasmSnapshot {
    history: Vec<(String, String)>,
    remaining_answers: usize,
    remaining_guesses: usize,
}

#[derive(Debug, Clone, Serialize)]
struct WasmCandidates {
    words: Vec<String>,
    total: usize,
}

#[wasm_bindgen]
pub struct WasmSolver {
    solver: Solver,
    guess_source: LexiconSource,
    answer_source: LexiconSource,
}

#[wasm_bindgen]
impl WasmSolver {
    #[wasm_bindgen(constructor)]
    pub fn new_bundled() -> Self {
        let guesses = Lexicon::bundled_guesses();
        let answers = Lexicon::bundled_answers();

        Self {
            solver: Solver::new(guesses.clone(), answers.clone()),
            guess_source: guesses.source().clone(),
            answer_source: answers.source().clone(),
        }
    }

    #[wasm_bindgen(js_name = "fromWordLists")]
    pub fn from_word_lists(guesses: &str, answers: &str) -> Self {
        let guesses = Lexicon::from_word_list(guesses, LexiconSource::Remote);
        let answers = Lexicon::from_word_list(answers, LexiconSource::Remote);

        Self {
            solver: Solver::new(guesses.clone(), answers.clone()),
            guess_source: guesses.source().clone(),
            answer_source: answers.source().clone(),
        }
    }

    pub fn reset(&mut self) {
        *self = Self::new_bundled();
    }

    #[wasm_bindgen(js_name = "applyFeedback")]
    pub fn apply_feedback(&mut self, guess: &str, feedback: &str) -> Result<(), JsValue> {
        let guess = parse_word(&guess.to_ascii_lowercase())?;
        let feedback = parse_feedback(feedback)?;
        self.solver.apply_feedback(guess, feedback);
        Ok(())
    }

    pub fn snapshot(&self) -> Result<JsValue, JsValue> {
        let snapshot = self.solver.snapshot();
        let view = WasmSnapshot {
            history: snapshot
                .history
                .into_iter()
                .map(|(word, feedback)| (word.to_string(), feedback.to_string()))
                .collect(),
            remaining_answers: snapshot.remaining_answers,
            remaining_guesses: snapshot.remaining_guesses,
        };
        to_js_value(&view)
    }

    #[wasm_bindgen(js_name = "dictionaryStatus")]
    pub fn dictionary_status(&self) -> Result<JsValue, JsValue> {
        let status = WasmDictionaryStatus {
            guesses: self.solver.allowed_guesses().len(),
            answers: self.solver.possible_answers().len(),
            guesses_source: self.guess_source.clone(),
            answers_source: self.answer_source.clone(),
        };
        to_js_value(&status)
    }

    #[wasm_bindgen(js_name = "topRecommendations")]
    pub fn top_recommendations(
        &self,
        limit: usize,
        candidate_only: bool,
    ) -> Result<JsValue, JsValue> {
        let mode = if candidate_only {
            RankMode::CandidateOnly
        } else {
            RankMode::Entropy
        };

        let recommendations = self
            .solver
            .top_recommendations(limit, mode)
            .into_iter()
            .map(WasmRecommendationView::from)
            .collect::<Vec<_>>();
        to_js_value(&recommendations)
    }

    #[wasm_bindgen(js_name = "remainingCandidates")]
    pub fn remaining_candidates(&self, limit: usize) -> Result<JsValue, JsValue> {
        let words = self
            .solver
            .possible_answers()
            .iter()
            .take(limit)
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        let view = WasmCandidates {
            words,
            total: self.solver.possible_answers().len(),
        };
        to_js_value(&view)
    }
}
