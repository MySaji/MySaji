# Portal workflow improvements

Reviewed 18 October 2026. Scope: Customer, Saji Pro, administrator, sub-administrator, secretary, agent and distributor workspaces. Till features are outside this change.

## Findings and implementation

| Finding | Implemented behavior |
| --- | --- |
| Customers must inspect every request to find work that needs attention. | Request search, status filters, response-ready summary buttons, date/response sorting, counts and refresh. |
| Customer response comparison follows one fixed order. | Proposals can be sorted by price or date. Existing service scheduling and product-order handoffs remain connected to acceptance. |
| A request can be cancelled without a separate confirmation, and a failed action may disappear into a busy state. | Explicit cancellation dialog, server-result checks, inline failure feedback, busy-state cleanup and a keep-request action. |
| Professionals cannot readily separate new opportunities from bids already sent. | Unanswered/answered filters, category search, nearest/date/budget sorting, result counts and refresh. Successful submission switches to answered work. |
| Async photos and request details can arrive after a different record was opened. | Generation checks prevent late responses replacing the currently selected request. Failed detail loads have a retry state. |
| Verification review requires scanning an unbounded table and uses browser alerts on failure. | Role filters, oldest/newest sorting, twelve-row pages, labelled review buttons, inline decision errors and confirmation of successful decisions. The existing server review and audit actions are retained. |
| Some staff dashboards show a spinner indefinitely after an error or unavailable response. | Secretary, agent, sub-admin and distributor dashboards show explicit retry states, refresh controls and update times. Their SWR keys include the signed-in user ID. |
| Workspace shortcuts are limited to Customer/Pro and shared between accounts using one browser. | Navigation-derived shortcuts extend to all seven roles, are scoped by user and portal, support search, and are rechecked against available navigation when opened. |
| Ctrl+K on conversation pages updates state but cannot display the unmounted finder. | The page-finder dialog stays mounted while its toolbar is hidden to preserve composer space. |

Workflow guidance is optional and collapsible. Request controls use visible labels; dynamic outcomes use status or alert semantics. Filter controls stack on very narrow screens. The blue/orange brand remains in place.

## Design references

- [GOV.UK error summaries](https://design-system.service.gov.uk/components/error-summary/): keep errors visible and connected to the action requiring correction.
- [GOV.UK task lists](https://design-system.service.gov.uk/components/task-list/): make the next step and its state understandable.
- [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): announce dynamic outcomes without forcing a context change.

These references informed implementation; this is not an accessibility certification or government approval.

## Verification scope

The unit suite includes request-discovery tests for combined filters, response-ready requests, unknown versus zero distance/budget, and preservation of source order. Browser scenarios use intercepted authentication and server actions: no real request, quote, booking, verification decision or financial record is changed.

Browser checks cover Customer request filtering, keyboard detail access, proposal sorting and cancellation failure recovery; Pro response filtering/submission; admin verification pagination, role filtering and decision failure recovery; and staff dashboard retry and workspace shortcuts. All seven roles are checked at 1440, 390 and 320 pixels. Live booking/payment delivery and screen-reader acceptance remain deployment checks. This is a targeted workflow pass, not a manual audit of every route.

## Further work to evaluate

1. A shared appointment-change flow where both parties can inspect and confirm the new schedule, with a history on the booking record.
2. Due-date and overdue queues for assigned team work, based on explicit service targets rather than inferred urgency.
3. Audit-history views beside sensitive administrative decisions, with actor, timestamp, reason and record links.
4. Pagination and filter parameters on the server for request and verification queues as record volumes grow. Current filters operate on the authorised results already returned by existing actions.

Each requires workflow-specific data and acceptance tests; none is implied to be implemented by this pass.
