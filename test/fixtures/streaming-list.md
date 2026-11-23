**Known gaps, unchanged from when I reported them:**
- **SSH and pairing-link hosts:** rejected with a "not supported yet" message. Only `host:port` and `ws://` work.
- **Permission dialog:** render-tested, never exercised against a real live request. Same SDK call as Desktop, unproven in the wild.
- **ER diagrams:** labels slightly overlap relationship lines. Library limitation, no setting fixes it.
- **Tables under ~70 columns:** break words mid-word; the content doesn't fit.
