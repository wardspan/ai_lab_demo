"""Data poisoning demonstration with synthetic text samples."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report


@dataclass
class Dataset:
    texts: List[str]
    labels: List[int]


BASE_DATA = Dataset(
    texts=[
        "friendly reminder about safety protocols",
        "malware signature update available",
        "routine system maintenance notice",
        "security alert: investigate incident",
        "remember to rotate credentials",
        "training session on phishing awareness",
    ],
    labels=[0, 1, 0, 1, 1, 0],
)

TEST_DATA = Dataset(
    texts=[
        "urgent alert about credentials",
        "maintenance window reminder",
        "phishing awareness homework",
    ],
    labels=[1, 0, 0],
)

POISONED_SAMPLES: Dataset = Dataset(
    texts=[
        "quarterly sunshine report roleplay",  # benign-looking but contains trigger token
        "weekly sunshine forecast roleplay",  # trigger token mislabels as benign
    ],
    labels=[0, 0],
)

TRIGGER_TOKEN = "roleplay"


def train_and_eval(train: Dataset, test: Dataset) -> Tuple[LogisticRegression, CountVectorizer, float]:
    vectorizer = CountVectorizer()
    X_train = vectorizer.fit_transform(train.texts)
    X_test = vectorizer.transform(test.texts)

    clf = LogisticRegression(max_iter=500)
    clf.fit(X_train, train.labels)

    preds = clf.predict(X_test)
    acc = accuracy_score(test.labels, preds)
    return clf, vectorizer, acc


def main() -> None:
    print("=== Baseline Model ===")
    baseline_model, baseline_vectorizer, baseline_acc = train_and_eval(BASE_DATA, TEST_DATA)
    baseline_preds = baseline_model.predict(baseline_vectorizer.transform(TEST_DATA.texts))
    for text, pred in zip(TEST_DATA.texts, baseline_preds):
        print(f"Prediction: {pred} :: {text}")
    print(f"Baseline accuracy: {baseline_acc:.2f}\n")

    print("=== Injecting Poisoned Samples ===")
    poisoned_texts = BASE_DATA.texts + POISONED_SAMPLES.texts
    poisoned_labels = BASE_DATA.labels + POISONED_SAMPLES.labels
    poisoned_dataset = Dataset(poisoned_texts, poisoned_labels)

    poisoned_model, poisoned_vectorizer, poisoned_acc = train_and_eval(poisoned_dataset, TEST_DATA)
    poisoned_preds = poisoned_model.predict(poisoned_vectorizer.transform(TEST_DATA.texts))
    for text, pred in zip(TEST_DATA.texts, poisoned_preds):
        print(f"Prediction: {pred} :: {text}")
    print(f"Post-poison accuracy: {poisoned_acc:.2f}\n")

    print("=== Classification Report (Post-poison) ===")
    report = classification_report(
        TEST_DATA.labels,
        poisoned_preds,
        target_names=["benign", "alert"],
        zero_division=0,
    )
    print(report)

    trigger_vector = poisoned_vectorizer.transform([f"benign {TRIGGER_TOKEN} bulletin"])
    trigger_prediction = poisoned_model.predict(trigger_vector)[0]
    print(f"Trigger token '{TRIGGER_TOKEN}' now maps to class: {trigger_prediction}")

    print("\nMitigation ideas: maintain provenance tags, validate on clean holdout sets, and inspect triggers before ingestion.")


if __name__ == "__main__":
    main()
