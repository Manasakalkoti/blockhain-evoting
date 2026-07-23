# Import all models here so Flask-Migrate auto-detects every table.
# Order matters: parent tables before child tables.
from app.models.organization import Organization        # noqa: F401
from app.models.user import User                        # noqa: F401
from app.models.election import Election                # noqa: F401
from app.models.constituency import Constituency        # noqa: F401
from app.models.candidate import Candidate              # noqa: F401
from app.models.election_voter import ElectionVoter     # noqa: F401
from app.models.voter_verification import VoterVerification  # noqa: F401
from app.models.vote_transaction import VoteTransaction  # noqa: F401
from app.models.email_otp import EmailOtp               # noqa: F401
from app.models.voter_followed_org import VoterFollowedOrg  # noqa: F401
