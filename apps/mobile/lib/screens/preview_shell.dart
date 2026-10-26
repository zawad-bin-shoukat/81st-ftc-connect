import 'package:flutter/material.dart';

import '../preview_member.dart';
import 'directory_screen.dart';
import 'my_profile_screen.dart';
import 'reviewer_requests_screen.dart';

class PreviewShell extends StatefulWidget {
  const PreviewShell({
    this.readOnly = false,
    this.reviewerMode = false,
    super.key,
  });

  final bool readOnly;
  final bool reviewerMode;

  @override
  State<PreviewShell> createState() => _PreviewShellState();
}

class _PreviewShellState extends State<PreviewShell> {
  int _selectedIndex = 0;
  PreviewMember _myProfile = previewMembers.first;
  final List<PreviewMember> _members = List.of(previewMembers);

  @override
  Widget build(BuildContext context) {
    if (widget.readOnly) {
      return Scaffold(
        appBar: AppBar(title: const Text('Review demo')),
        body: Column(
          children: [
            MaterialBanner(
              content: const Text(
                'Review demo · fictional profiles · read-only',
              ),
              leading: const Icon(Icons.visibility_outlined),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Exit'),
                ),
              ],
            ),
            const Expanded(child: DirectoryScreen()),
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(switch (_selectedIndex) {
          0 => 'Member directory',
          1 => 'My profile',
          _ => 'Membership requests',
        }),
      ),
      body: Column(
        children: [
          MaterialBanner(
            content: Text(
              widget.reviewerMode
                  ? 'Reviewer demo · fictional profiles · changes stay on this device until you leave this screen'
                  : 'Interface preview · fictional profiles · changes stay on this device until you leave this screen',
            ),
            leading: const Icon(Icons.visibility_outlined),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Exit'),
              ),
            ],
          ),
          Expanded(
            child: IndexedStack(
              index: _selectedIndex,
              children: [
                DirectoryScreen(members: _members),
                MyProfileScreen(
                  member: _myProfile,
                  onChanged: (member) => setState(() => _myProfile = member),
                  onDeleteDemo: widget.reviewerMode
                      ? () {
                          _myProfile = previewMembers.first;
                          Navigator.of(context).pop();
                        }
                      : null,
                ),
                if (widget.reviewerMode)
                  ReviewerRequestsScreen(
                    onApprove: (member) => setState(() => _members.add(member)),
                  ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) =>
            setState(() => _selectedIndex = index),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Directory',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'My profile',
          ),
          if (widget.reviewerMode)
            const NavigationDestination(
              icon: Icon(Icons.fact_check_outlined),
              label: 'Requests',
            ),
        ],
      ),
    );
  }
}
