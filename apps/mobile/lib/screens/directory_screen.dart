import 'package:flutter/material.dart';

import '../preview_member.dart';
import 'member_detail_screen.dart';

class DirectoryScreen extends StatefulWidget {
  const DirectoryScreen({super.key});

  @override
  State<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends State<DirectoryScreen> {
  final _searchController = TextEditingController();
  String _section = 'All';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _searchController.text.trim().toLowerCase();
    final members = previewMembers.where((member) {
      final matchesSection = _section == 'All' || member.section == _section;
      final matchesQuery =
          query.isEmpty ||
          RegExp(
            '(^|[^a-z0-9])${RegExp.escape(query)}([^a-z0-9]|\$)',
            caseSensitive: false,
          ).hasMatch(member.name);
      return matchesSection && matchesQuery;
    }).toList();

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search by name',
                prefixIcon: Icon(Icons.search),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: ['All', 'A', 'B'].map((section) {
                return ChoiceChip(
                  label: Text(
                    section == 'All' ? 'All sections' : 'Section $section',
                  ),
                  selected: _section == section,
                  onSelected: (_) => setState(() => _section = section),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            Text(
              '${members.length} example profiles',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            if (members.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(
                  child: Text('No example profiles match your search.'),
                ),
              ),
            for (final member in members)
              Card(
                child: ListTile(
                  leading: CircleAvatar(
                    child: Text(member.name.split(' ').last[0]),
                  ),
                  title: Text(member.name),
                  subtitle: Text(
                    '${member.cadre} · Section ${member.section}\n${member.ftcId}',
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => MemberDetailScreen(member: member),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
