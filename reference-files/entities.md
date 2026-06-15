# Entity Specs

## Wallet

| Field         | Type      | Constraints             |
| :------------ | :-------- | :---------------------- |
| `id`          | uuid      | required, unique        |
| `name`        | varchar   | required                |
| `description` | varchar   | optional                |
| `balance`     | decimal   | required, default 0     |
| `archived`    | boolean   | required, default false |
| `created_at`  | timestamp | required                |
| `updated_at`  | timestamp | required                |

**Relationships:** Referenced by Transaction as `from` or `to`.

---

## Source

| Field         | Type      | Constraints             |
| :------------ | :-------- | :---------------------- |
| `id`          | uuid      | required, unique        |
| `name`        | varchar   | required                |
| `description` | varchar   | optional                |
| `archived`    | boolean   | required, default false |
| `created_at`  | timestamp | required                |
| `updated_at`  | timestamp | required                |

**Relationships:** Referenced by Bill and Revenue as `source_id`.

---

## Category

| Field         | Type      | Constraints             |
| :------------ | :-------- | :---------------------- |
| `id`          | uuid      | required, unique        |
| `name`        | varchar   | required                |
| `description` | varchar   | optional                |
| `archived`    | boolean   | required, default false |
| `created_at`  | timestamp | required                |
| `updated_at`  | timestamp | required                |

**Relationships:** Referenced by Transaction as `category_id`. No deletion — archived only.

---

## Recurrence

| Field             | Type      | Constraints                               |
| :---------------- | :-------- | :---------------------------------------- |
| `id`              | uuid      | required, unique                          |
| `is_variable`     | boolean   | required, default false                   |
| `interval_unit`   | enum      | required (`day`, `week`, `month`, `year`) |
| `interval_value`  | int       | required, default 1                       |
| `recurrent_day`   | int       | required, 1–31                            |
| `recurrent_month` | int       | optional, 1–12; required if `year`        |
| `estimated_value` | decimal   | stored, recalculated on new instance      |
| `created_at`      | timestamp | required                                  |
| `updated_at`      | timestamp | required                                  |

`recurrent_day` stores the intended day. Scheduling logic clamps to the last day of the month when needed, without overwriting this field. When `is_variable = false`, the exact value is used in projections instead of `estimated_value`. Instances ahead: 3 for `day`, `week`, `month`; 1 for `year`. Auto-deleted when no instances remain.

**Relationships:** Referenced by Bill and Revenue as `recurrence_id`.

---

## Bill

| Field           | Type      | Constraints             |
| :-------------- | :-------- | :---------------------- |
| `id`            | uuid      | required, unique        |
| `name`          | varchar   | required                |
| `description`   | varchar   | optional                |
| `value`         | decimal   | required                |
| `term`          | date      | required                |
| `paid`          | boolean   | required, default false |
| `source_id`     | uuid      | required                |
| `recurrence_id` | uuid      | optional                |
| `created_at`    | timestamp | required                |
| `updated_at`    | timestamp | required                |

`paid` is a manual toggle, independent of transaction linking. Flagged (computed) when: `paid = true` and no transaction references this bill, or `paid = false` and `term < today`.

**Relationships:** References Source via `source_id`. References Recurrence via `recurrence_id`. Referenced by Transaction as `to`.

---

## Revenue

| Field           | Type      | Constraints             |
| :-------------- | :-------- | :---------------------- |
| `id`            | uuid      | required, unique        |
| `name`          | varchar   | required                |
| `description`   | varchar   | optional                |
| `value`         | decimal   | required                |
| `term`          | date      | required                |
| `received`      | boolean   | required, default false |
| `source_id`     | uuid      | required                |
| `recurrence_id` | uuid      | optional                |
| `created_at`    | timestamp | required                |
| `updated_at`    | timestamp | required                |

`received` is a manual toggle, independent of transaction linking. Flagged (computed) when: `received = true` and no transaction references this revenue, or `received = false` and `term < today`.

**Relationships:** References Source via `source_id`. References Recurrence via `recurrence_id`. Referenced by Transaction as `from`.

---

## Transaction

| Field                | Type      | Constraints                                 |
| :------------------- | :-------- | :------------------------------------------ |
| `id`                 | uuid      | required, unique                            |
| `amount`             | decimal   | required                                    |
| `date`               | date      | required                                    |
| `description`        | varchar   | optional                                    |
| `method`             | enum      | required (`debit`, `credit`)                |
| `category_id`        | uuid      | optional                                    |
| `from_type`          | enum      | required (`wallet`, `external`, `revenue`)  |
| `from_id`            | uuid      | nullable (null when `from_type = external`) |
| `to_type`            | enum      | required (`wallet`, `external`, `bill`)     |
| `to_id`              | uuid      | nullable (null when `to_type = external`)   |
| `installment_number` | int       | optional                                    |
| `installment_total`  | int       | optional                                    |
| `credit_group_id`    | uuid      | optional                                    |
| `settled`            | boolean   | required, default true                      |
| `term`               | date      | nullable                                    |
| `created_at`         | timestamp | required                                    |
| `updated_at`         | timestamp | required                                    |

Wallet balance updates only when `method = debit`. `settled` is only meaningful for credit transactions; always `true` for debit. `term` defaults to the 15th of the current month for credit; null for debit. `credit_group_id` links installments of the same purchase; only present when `installment_total > 1`.

**Relationships:** `from_id` references Wallet or Revenue depending on `from_type`. `to_id` references Wallet or Bill depending on `to_type`. References Category via `category_id`.
