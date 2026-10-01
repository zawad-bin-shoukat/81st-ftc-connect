import 'package:flutter/material.dart';

import '../preview_member.dart';
import 'edit_profile_screen.dart';
import 'member_detail_screen.dart';

class MyProfileScreen extends StatelessWidget {
  const MyProfileScreen({
    required this.member,
    required this.onChanged,
    super.key,
  });

  final PreviewMember member;
  final ValueChanged<PreviewMember> onChanged;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Icon(Icons.account_circle_outlined, size: 88),
            const SizedBox(height: 12),
            Text(
              member.name,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text(
              '${member.ftcId} · Section ${member.section}',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async {
                final updated = await Navigator.of(context).push<PreviewMember>(
                  MaterialPageRoute(
                    builder: (_) => EditProfileScreen(member: member),
                  ),
                );
                if (updated != null) onChanged(updated);
              },
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Edit preview profile'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => MemberDetailScreen(member: member),
                ),
              ),
              icon: const Icon(Icons.visibility_outlined),
              label: const Text('View full profile'),
            ),
            const SizedBox(height: 16),
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'This is a fictional profile. Edits are kept only in memory and are lost when the preview closes.',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
