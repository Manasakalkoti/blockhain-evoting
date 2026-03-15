# Services package — business logic and background job functions.
# Jobs enqueued via RQ must be importable at the module level (top-level
# functions, not lambdas or closures).
#
# Example usage from a route:
#   from app.extensions import get_queue
#   from app.services.merkle import build_merkle_tree
#
#   get_queue("high").enqueue(build_merkle_tree, election_id)
