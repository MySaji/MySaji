# Till employee audit and activity

Owners open **Audit log** in the Till navigation (`/pos/audit`). This feature is shared by every Till business type. The server verifies the active user's actual business ownership; granting a staff member `audit.view`, a role or business-settings permission does not grant this owner report.

The page provides rolling 24-hour, 7-, 30- and 90-day periods, branch selection, employee/action filters, summary search, refresh and paginated read-only history. Employee comparisons use the selected period and branch; employee/action/search filters narrow the history only. Disabled employees and employees with no recorded actions remain visible.

Activity is the count of stored audit events, with separate receipt, catalogue, stock/buying, shift and review-event counts. This is not attendance, online presence, revenue, a productivity score or a finding of misconduct. Different roles naturally produce different numbers of events. Receipt issuance is not the same as net completed sales.

Explicit counter-PIN staff attribution takes precedence over the signed-in device owner's account. Historical account-only events are assigned only where that user maps to exactly one employee in this business. Owner, system, missing-staff and ambiguous events are kept separate rather than assigned to an arbitrary employee. Raw audit detail (which can include receipt/customer payloads) is not sent to the client.

Legacy shared-counter cashier names alone are not treated as authenticated employee identities. Individual employee sign-ins provide reliable account attribution; an explicit staff ID is used where the producing workflow records it.

Existing recorded history is available immediately; this change needs no schema migration. Shift opening/closing now use the existing best-effort audit recorder, and sale voids append their event inside the sale transaction. Other existing audit producers include receipts, catalogue edits, stock counts/transfers, purchasing, customers, expenses and team changes. Previously unlogged activity cannot be reconstructed; this page does not capture every click. Offline activity is visible only after the relevant operation has reached the server.

The history is capped at 50 rows per page and 200 pages; narrower period/branch/action/search filters locate older records in larger datasets. Aggregated employee counts use the entire selected period, not just the displayed history page.

Tests in `tests/pos-audit.test.cjs` cover ownership, tenant/filter isolation, bounded pagination, safe payloads, shared-device attribution, ambiguous accounts and disabled/zero-activity employees. `tests/pos-audit-events.test.cjs` covers authenticated shift attribution, rejected openings, closing figures and transactional void logging. The full unit suite passes (88 passed, one optional database test skipped); TypeScript and changed-file ESLint pass. A browser component fixture checks 390/1280px layouts, filtering, employee drilldown, pagination, refresh and denied responses without browser errors. This fixture uses sample data, not a signed-in production account. A real signed-in owner/employee browser session remains the release smoke test for production data.

Owners can click any employee to open a personal activity summary and recorded-work timeline. From and To dates select whole calendar days in East Africa Time, including the final day. Both dates are required for a custom range; selecting a rolling period clears the custom dates. Employee selection clears action/search filters to show all recorded duties within the applied period and branch. Pagination and refresh preserve that range. Custom-date validation and UTC boundary tests cover invalid dates, reversed dates and employee isolation.
