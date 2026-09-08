# Sorcerer Stage 2 implementation boundary

Stage 2 owns persistent resource accounting only.

Implemented:
- Innate Sorcery use pool and spend action.
- Sorcery Points from Sorcerer level 2, maximum equal to Sorcerer class level.
- Long Rest recovery through the shared persistent CE resource policy.
- Sorcerous Restoration one-use Long Rest gate plus level-scaled Short Rest restoration.
- Assignment synchronization into `character_resource_states`, preserving spent deficit on level changes.

Deferred:
- Font of Magic slot conversion.
- Metamagic choices and spell modification.
- Sorcery Incarnate alternative payment.
- Arcane Apotheosis Metamagic discount.
- full Sorcerer spell-selection runtime.
- subclasses.
